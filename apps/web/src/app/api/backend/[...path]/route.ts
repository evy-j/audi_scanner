import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_BACKEND_API_BASE_URL = "https://audit-scanner-api.onrender.com/api/v1";

type BackendRouteContext = {
  params: Promise<{ path: string[] }>;
};

function normalizeBackendApiBaseUrl(value: string | undefined): string {
  const raw = (value || DEFAULT_BACKEND_API_BASE_URL).trim().replace(/\/+$/u, "");
  if (!raw) return DEFAULT_BACKEND_API_BASE_URL;

  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname.replace(/\/+$/u, "");
    if (pathname === "/api/v1" || pathname.endsWith("/api/v1")) {
      parsed.pathname = pathname;
      return parsed.toString().replace(/\/+$/u, "");
    }
    parsed.pathname = `${pathname === "/" ? "" : pathname}/api/v1`;
    return parsed.toString().replace(/\/+$/u, "");
  } catch {
    return DEFAULT_BACKEND_API_BASE_URL;
  }
}

function backendBaseUrl(): string {
  const explicitServerUrl = process.env.BACKEND_API_BASE_URL || process.env.API_BASE_URL;
  const publicUrl = process.env.NEXT_PUBLIC_BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  const chosen = explicitServerUrl || (publicUrl?.startsWith("http") ? publicUrl : undefined);
  return normalizeBackendApiBaseUrl(chosen);
}

async function targetUrl(request: NextRequest, context: BackendRouteContext): Promise<string> {
  const params = await context.params;
  const path = (params.path || []).map((part) => encodeURIComponent(part)).join("/");
  return `${backendBaseUrl()}/${path}${request.nextUrl.search}`;
}

function forwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  const passThrough = ["authorization", "content-type", "x-api-key", "x-request-id", "x-correlation-id"];

  for (const key of passThrough) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }

  return headers;
}

function responseHeaders(source: Response): Headers {
  const headers = new Headers(source.headers);
  for (const key of ["connection", "content-encoding", "content-length", "keep-alive", "transfer-encoding", "upgrade"]) {
    headers.delete(key);
  }
  headers.set("cache-control", "no-store");
  return headers;
}

async function proxy(request: NextRequest, context: BackendRouteContext): Promise<NextResponse> {
  const method = request.method.toUpperCase();
  const requestInit: RequestInit = {
    method,
    headers: forwardedHeaders(request),
    cache: "no-store",
    redirect: "manual"
  };

  if (method !== "GET" && method !== "HEAD") {
    requestInit.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(await targetUrl(request, context), requestInit);
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "BACKEND_UNREACHABLE",
          message: "Frontend proxy could not reach the Audit Scanner API. Check BACKEND_API_BASE_URL / NEXT_PUBLIC_API_BASE_URL."
        }
      },
      { status: 502 }
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders(upstream)
  });
}

export async function GET(request: NextRequest, context: BackendRouteContext): Promise<NextResponse> {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: BackendRouteContext): Promise<NextResponse> {
  return proxy(request, context);
}

export async function PATCH(request: NextRequest, context: BackendRouteContext): Promise<NextResponse> {
  return proxy(request, context);
}

export async function DELETE(request: NextRequest, context: BackendRouteContext): Promise<NextResponse> {
  return proxy(request, context);
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type,x-api-key,x-request-id,x-correlation-id",
      "cache-control": "no-store"
    }
  });
}
