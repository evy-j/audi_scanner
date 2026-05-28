#!/usr/bin/env node
const value = process.env.REDIS_URL || process.argv[2] || "";

if (!value) {
  console.error("REDIS_URL is missing. Pass it as env or first argument.");
  process.exit(1);
}

let url;
try {
  url = new URL(value);
} catch (error) {
  console.error("REDIS_URL is not a valid URL.");
  process.exit(1);
}

const isRedisTcp = url.protocol === "redis:" || url.protocol === "rediss:";
const hasAuth = Boolean(url.username || url.password);
const summary = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;

console.log(JSON.stringify({
  ok: isRedisTcp && hasAuth,
  protocol: url.protocol,
  target: summary,
  hasAuth,
  verdict: isRedisTcp
    ? hasAuth
      ? "Looks like a Redis TCP/TLS URL for ioredis/BullMQ."
      : "Redis URL has no username/password. Check provider connection details."
    : "This is not a Redis TCP URL. Upstash REST URLs usually start with https:// and cannot be used as REDIS_URL for BullMQ."
}, null, 2));

process.exit(isRedisTcp && hasAuth ? 0 : 2);
