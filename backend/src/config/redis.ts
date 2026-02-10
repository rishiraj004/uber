import * as RedisPkg from 'ioredis';

// ioredis package may export a default constructor or a function; use a runtime
// wrapper to obtain the constructor and avoid TypeScript construct signature
// mismatches when compiling with NodeNext/ESM settings.
const IORedisConstructor: any = (RedisPkg as any).default ?? RedisPkg;

let redis: any;

if (process.env.REDIS_URL) {
  // Upstash / any Redis URL (TLS via rediss://)
  redis = new IORedisConstructor(process.env.REDIS_URL, {
    maxRetriesPerRequest: 5,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // Upstash may close idle connections; keep alive helps
    keepAlive: 30000,
  });
} else {
  // Fallback to individual host/port/password env vars
  redis = new IORedisConstructor({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USERNAME || undefined,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  });
}

redis.on('connect', () => console.log('Connected to Redis'));
redis.on('error', (err: Error) => console.error('Redis error', err));

export default redis;