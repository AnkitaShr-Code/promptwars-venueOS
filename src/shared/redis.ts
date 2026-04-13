import { Redis } from 'ioredis';
import { createLogger } from './logger.js';

const log = createLogger('Redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
    retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
});

redis.on('connect', () => log.info('Connected to Redis'));
redis.on('error', (err: Error) => log.error({ err }, 'Redis connection error'));

export default redis;
