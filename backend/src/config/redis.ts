import Redis from 'ioredis';

let redis: Redis;

if (process.env.REDIS_URL) {
  // Upstash / any Redis URL (TLS via rediss://)
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 5,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // Upstash may close idle connections; keep alive helps
    keepAlive: 30000,
  });
} else {
  // Fallback to individual host/port/password env vars
  redis = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USERNAME || undefined,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  });
}

redis.on('connect', () => console.log('Connected to Redis'));
redis.on('error', (err) => console.error('Redis error', err));

export default redis;