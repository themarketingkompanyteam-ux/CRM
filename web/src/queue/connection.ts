import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as { redisConn?: IORedis };

export const redisConnection =
  globalForRedis.redisConn ??
  new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisConn = redisConnection;
}
