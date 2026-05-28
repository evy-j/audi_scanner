import { createHash, randomUUID } from "node:crypto";
import { STATUS_CODES, type IncomingMessage, type Server as HttpServer } from "node:http";
import type { Socket } from "node:net";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { prisma } from "../infra/prisma/prisma.js";
import { env } from "../config/environment.js";
import { logger } from "../common/logging/logger.js";
import { ApiError } from "../common/errors/api-error.js";
import { tokenService } from "../common/security/token.service.js";
import type { AuthPrincipal } from "../common/security/auth-principal.js";
import { getApiKeyPrefix, verifyApiKeyHash } from "../common/security/api-key-hash.js";
import { RedisFixedWindowRateLimiter } from "../common/rate-limit/redis-fixed-window-rate-limiter.js";
import { RedisScanEventBus } from "./redis-scan-event-bus.js";
import { RealtimeAuthorizationService } from "./realtime-auth.service.js";
import {
  realtimeClientMessageSchema,
  type RealtimeClientMessage,
  type RealtimeServerMessage
} from "./realtime.types.js";
import type { ScanProgressEvent } from "@audit-scanner/shared/queues/scan-events";

interface RealtimeSubscription {
  organizationId: string;
  lastEventSequence: number;
  buffering: boolean;
  buffer: ScanProgressEvent[];
}

interface RealtimeClient {
  id: string;
  socket: WebSocket;
  principal: AuthPrincipal;
  isAlive: boolean;
  subscriptions: Map<string, RealtimeSubscription>;
}

export class ScanRealtimeGateway {
  private readonly webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: env.REALTIME_MAX_MESSAGE_BYTES
  });
  private readonly eventBus = new RedisScanEventBus((event) => this.broadcastScanEvent(event));
  private readonly authorization = new RealtimeAuthorizationService();
  private readonly upgradeRateLimiter = new RedisFixedWindowRateLimiter(
    "realtime-upgrade",
    env.REALTIME_RATE_LIMIT_WINDOW_MS,
    env.REALTIME_RATE_LIMIT_MAX_CONNECTIONS
  );
  private readonly clients = new Map<string, RealtimeClient>();
  private readonly scanClients = new Map<string, Set<string>>();
  private readonly heartbeatTimer: NodeJS.Timeout;

  constructor(private readonly httpServer: HttpServer) {
    this.httpServer.on("upgrade", this.handleUpgrade);
    this.heartbeatTimer = setInterval(
      () => this.pingClients(),
      env.REALTIME_HEARTBEAT_INTERVAL_MS
    );
  }

  async close(): Promise<void> {
    clearInterval(this.heartbeatTimer);
    this.httpServer.off("upgrade", this.handleUpgrade);

    for (const client of this.clients.values()) {
      client.socket.close(1001, "Server shutting down");
    }

    await Promise.allSettled([
      new Promise<void>((resolve, reject) => {
        this.webSocketServer.close((error) => (error ? reject(error) : resolve()));
      }),
      this.eventBus.close()
    ]);
  }

  private readonly handleUpgrade = (request: IncomingMessage, socket: Socket, head: Buffer) => {
    if (!this.isRealtimePath(request)) {
      return;
    }

    void this.handleRealtimeUpgrade(request, socket, head);
  };

  private async handleRealtimeUpgrade(
    request: IncomingMessage,
    socket: Socket,
    head: Buffer
  ): Promise<void> {
    if (!isAllowedOrigin(request)) {
      rejectUpgrade(socket, 403, "Realtime origin denied");
      return;
    }

    try {
      const rateLimit = await this.upgradeRateLimiter.consume(getRealtimeRateLimitKey(request));
      if (rateLimit.limited) {
        rejectUpgrade(socket, 429, "Too many realtime connection attempts", {
          "Retry-After": Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000)).toString()
        });
        return;
      }
    } catch (error) {
      logger.error({ err: error }, "realtime upgrade rate limit failed");
      rejectUpgrade(socket, 503, "Realtime admission unavailable");
      return;
    }

    void this.authenticateRequest(request)
      .then((principal) => {
        this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
          this.handleConnection(webSocket, request, principal);
        });
      })
      .catch((error) => {
        const apiError = error instanceof ApiError ? error : ApiError.unauthorized();
        rejectUpgrade(socket, apiError.statusCode, apiError.message);
      });
  }

  private handleConnection(
    socket: WebSocket,
    request: IncomingMessage,
    principal: AuthPrincipal
  ): void {
    const client: RealtimeClient = {
      id: randomUUID(),
      socket,
      principal,
      isAlive: true,
      subscriptions: new Map()
    };

    this.clients.set(client.id, client);

    socket.on("message", (data) => {
      void this.handleMessage(client, data);
    });
    socket.on("pong", () => {
      client.isAlive = true;
    });
    socket.on("close", () => {
      void this.removeClient(client);
    });
    socket.on("error", (error) => {
      logger.warn({ err: error, connectionId: client.id }, "realtime websocket error");
    });

    this.send(client, {
      type: "connection.ready",
      connectionId: client.id,
      heartbeatIntervalMs: env.REALTIME_HEARTBEAT_INTERVAL_MS,
      maxSubscriptions: env.REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION,
      serverTime: new Date().toISOString()
    });

    logger.info(
      {
        connectionId: client.id,
        principalType: principal.type,
        userId: principal.userId,
        ipAddress: request.socket.remoteAddress
      },
      "realtime client connected"
    );
  }

  private async handleMessage(client: RealtimeClient, data: RawData): Promise<void> {
    const parsed = parseClientMessage(data);

    if (parsed.ok === false) {
      const parseError = (parsed as ParseClientMessageFailure).error;
      this.send(client, {
        type: "error",
        code: "VALIDATION_ERROR",
        message: "Realtime message validation failed",
        details: parseError
      });
      return;
    }

    const message = (parsed as ParseClientMessageSuccess).message;

    switch (message.type) {
      case "scan.subscribe":
        await this.subscribeToScan(client, message);
        return;
      case "scan.unsubscribe":
        await this.unsubscribeFromScan(client, message.scanId, message.requestId);
        return;
      case "ping":
        this.send(client, {
          type: "pong",
          ...(message.requestId ? { requestId: message.requestId } : {}),
          ...(message.nonce ? { nonce: message.nonce } : {}),
          serverTime: new Date().toISOString()
        });
        return;
    }
  }

  private async subscribeToScan(
    client: RealtimeClient,
    message: Extract<RealtimeClientMessage, { type: "scan.subscribe" }>
  ): Promise<void> {
    const existing = client.subscriptions.get(message.scanId);
    if (!existing && client.subscriptions.size >= env.REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION) {
      this.sendError(client, message.requestId, "SUBSCRIPTION_LIMIT", "Too many active subscriptions");
      return;
    }

    try {
      const authorization = await this.authorization.authorizeScanSubscription(
        client.principal,
        message.scanId
      );
      const lastEventSequence = message.lastEventSequence ?? existing?.lastEventSequence ?? 0;
      const subscription: RealtimeSubscription = {
        organizationId: authorization.organizationId,
        lastEventSequence,
        buffering: true,
        buffer: []
      };

      if (!existing) {
        await this.eventBus.subscribe(message.scanId);
      }

      client.subscriptions.set(message.scanId, subscription);
      this.addScanClient(message.scanId, client.id);

      const [state, timeline] = await Promise.all([
        this.eventBus.getState(message.scanId),
        this.eventBus.getTimelineSince(message.scanId, lastEventSequence)
      ]);

      this.send(client, {
        type: "scan.snapshot",
        scanId: message.scanId,
        state
      });

      let replayedEvents = 0;
      for (const event of timeline) {
        if (this.sendScanEvent(client, event)) {
          replayedEvents += 1;
        }
      }

      subscription.buffering = false;
      for (const event of subscription.buffer.sort((left, right) => left.sequence - right.sequence)) {
        this.sendScanEvent(client, event);
      }
      subscription.buffer = [];

      this.send(client, {
        type: "subscription.confirmed",
        ...(message.requestId ? { requestId: message.requestId } : {}),
        scanId: message.scanId,
        organizationId: authorization.organizationId,
        lastEventSequence: subscription.lastEventSequence,
        replayedEvents
      });
    } catch (error) {
      if (!existing) {
        await this.unsubscribeFromScan(client, message.scanId);
      }

      const apiError = error instanceof ApiError ? error : ApiError.forbidden("Subscription failed");
      this.sendError(client, message.requestId, apiError.code, apiError.message, apiError.details);
    }
  }

  private async unsubscribeFromScan(
    client: RealtimeClient,
    scanId: string,
    requestId?: string | undefined
  ): Promise<void> {
    const existing = client.subscriptions.get(scanId);
    if (!existing) {
      return;
    }

    client.subscriptions.delete(scanId);
    this.removeScanClient(scanId, client.id);
    await this.eventBus.unsubscribe(scanId);

    this.send(client, {
      type: "subscription.closed",
      ...(requestId ? { requestId } : {}),
      scanId
    });
  }

  private broadcastScanEvent(event: ScanProgressEvent): void {
    const clientIds = this.scanClients.get(event.scanId);
    if (!clientIds) {
      return;
    }

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (!client) {
        continue;
      }

      this.sendScanEvent(client, event);
    }
  }

  private sendScanEvent(client: RealtimeClient, event: ScanProgressEvent): boolean {
    const subscription = client.subscriptions.get(event.scanId);
    if (!subscription || event.sequence <= subscription.lastEventSequence) {
      return false;
    }

    if (subscription.organizationId !== event.organizationId) {
      return false;
    }

    if (subscription.buffering) {
      subscription.buffer.push(event);
      return false;
    }

    const sent = this.send(client, {
      type: "scan.event",
      event
    });

    if (sent) {
      subscription.lastEventSequence = event.sequence;
    }

    return sent;
  }

  private send(client: RealtimeClient, message: RealtimeServerMessage): boolean {
    if (client.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    if (client.socket.bufferedAmount > env.REALTIME_MAX_BUFFERED_BYTES) {
      client.socket.close(1011, "Realtime client is too slow");
      return false;
    }

    try {
      client.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.warn({ err: error, connectionId: client.id }, "realtime send failed");
      client.socket.terminate();
      return false;
    }
  }

  private sendError(
    client: RealtimeClient,
    requestId: string | undefined,
    code: string,
    message: string,
    details?: unknown
  ): void {
    this.send(client, {
      type: "error",
      ...(requestId ? { requestId } : {}),
      code,
      message,
      ...(details ? { details } : {})
    });
  }

  private pingClients(): void {
    for (const client of this.clients.values()) {
      if (!client.isAlive) {
        client.socket.terminate();
        void this.removeClient(client);
        continue;
      }

      client.isAlive = false;
      client.socket.ping();
    }
  }

  private async removeClient(client: RealtimeClient): Promise<void> {
    if (!this.clients.delete(client.id)) {
      return;
    }

    const scanIds = Array.from(client.subscriptions.keys());
    client.subscriptions.clear();

    await Promise.allSettled(
      scanIds.map(async (scanId) => {
        this.removeScanClient(scanId, client.id);
        await this.eventBus.unsubscribe(scanId);
      })
    );

    logger.info({ connectionId: client.id }, "realtime client disconnected");
  }

  private addScanClient(scanId: string, clientId: string): void {
    const clients = this.scanClients.get(scanId) ?? new Set<string>();
    clients.add(clientId);
    this.scanClients.set(scanId, clients);
  }

  private removeScanClient(scanId: string, clientId: string): void {
    const clients = this.scanClients.get(scanId);
    if (!clients) {
      return;
    }

    clients.delete(clientId);
    if (clients.size === 0) {
      this.scanClients.delete(scanId);
    }
  }

  private isRealtimePath(request: IncomingMessage): boolean {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    return url.pathname === env.REALTIME_WS_PATH;
  }

  private async authenticateRequest(request: IncomingMessage): Promise<AuthPrincipal> {
    const token = extractAccessToken(request);
    if (token) {
      return tokenService.verifyAccessToken(token);
    }

    const apiKey = extractApiKey(request);
    if (apiKey) {
      return this.authenticateApiKey(apiKey);
    }

    throw ApiError.unauthorized("Realtime authentication is required");
  }

  private async authenticateApiKey(key: string): Promise<AuthPrincipal> {
    const prefix = getApiKeyPrefix(key);
    if (!prefix) {
      throw ApiError.unauthorized("Invalid API key format");
    }

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyPrefix: prefix }
    });

    if (
      !apiKey ||
      apiKey.status !== "ACTIVE" ||
      apiKey.deletedAt ||
      (apiKey.expiresAt && apiKey.expiresAt <= new Date()) ||
      !verifyApiKeyHash(key, apiKey.keyHash)
    ) {
      throw ApiError.unauthorized("Invalid API key");
    }

    void prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    }).catch((error) => {
      logger.warn({ err: error, apiKeyId: apiKey.id }, "realtime api key usage touch failed");
    });

    return {
      type: "apiKey",
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      ...(apiKey.createdById ? { userId: apiKey.createdById } : {}),
      permissions: [],
      scopes: apiKey.scopes
    };
  }
}

type ParseClientMessageSuccess = { ok: true; message: RealtimeClientMessage };
type ParseClientMessageFailure = { ok: false; error: unknown };
type ParseClientMessageResult = ParseClientMessageSuccess | ParseClientMessageFailure;

function parseClientMessage(data: RawData): ParseClientMessageResult {
  try {
    const parsed = JSON.parse(rawDataToString(data));
    const result = realtimeClientMessageSchema.safeParse(parsed);

    if (!result.success) {
      return { ok: false, error: result.error.flatten() };
    }

    return { ok: true, message: result.data as RealtimeClientMessage };
  } catch {
    return { ok: false, error: "Invalid JSON payload" };
  }
}

function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  return Buffer.from(data as ArrayBuffer).toString("utf8");
}

function extractAccessToken(request: IncomingMessage): string | null {
  const authorization = getHeader(request, "authorization");
  const bearerToken = extractBearerToken(authorization);
  if (bearerToken && !bearerToken.startsWith("ask_")) {
    return bearerToken;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  return url.searchParams.get("access_token") ?? url.searchParams.get("token");
}

function getRealtimeRateLimitKey(request: IncomingMessage): string {
  const apiKey = extractApiKey(request);
  const apiKeyPrefix = apiKey ? getApiKeyPrefix(apiKey) : null;
  if (apiKeyPrefix) {
    return `api-key:${apiKeyPrefix}`;
  }

  const token = extractAccessToken(request);
  if (token) {
    return `token:${createHash("sha256").update(token).digest("base64url")}`;
  }

  return `ip:${getClientIp(request)}`;
}

function getClientIp(request: IncomingMessage): string {
  const forwardedFor = getHeader(request, "x-forwarded-for");
  if (env.TRUST_PROXY_HOPS > 0 && forwardedFor) {
    const addresses = forwardedFor
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean);
    const index = Math.max(0, addresses.length - env.TRUST_PROXY_HOPS);
    return addresses[index] ?? request.socket.remoteAddress ?? "unknown";
  }

  return request.socket.remoteAddress ?? "unknown";
}

function isAllowedOrigin(request: IncomingMessage): boolean {
  const origin = getHeader(request, "origin");
  if (!origin || env.CORS_ORIGINS.includes(origin)) {
    return true;
  }

  return env.NODE_ENV !== "production" && env.CORS_ORIGINS.length === 0;
}

function extractApiKey(request: IncomingMessage): string | null {
  const explicit = getHeader(request, "x-api-key");
  if (explicit) {
    return explicit;
  }

  const authorization = getHeader(request, "authorization");
  const bearerToken = extractBearerToken(authorization);
  if (bearerToken?.startsWith("ask_")) {
    return bearerToken;
  }

  return null;
}

function getHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function extractBearerToken(headerValue?: string): string | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function rejectUpgrade(
  socket: Socket,
  statusCode: number,
  message: string,
  headers: Record<string, string> = {}
): void {
  const statusText = STATUS_CODES[statusCode] ?? message;
  socket.write(
    [
      `HTTP/1.1 ${statusCode} ${statusText}`,
      "Connection: close",
      "Content-Type: text/plain; charset=utf-8",
      ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
      `Content-Length: ${Buffer.byteLength(message)}`,
      "",
      message
    ].join("\r\n")
  );
  socket.destroy();
}
