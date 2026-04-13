import { VenueEvent } from './types.js';
import redis from './redis.js';
import { createLogger } from './logger.js';

const log = createLogger('DLQ');

export class DeadLetterQueue {
    private readonly REDIS_KEY = 'dlq:events';
    private readonly MAX_SIZE = 1000;

    async push(event: any, reason: string): Promise<void> {
        const dlqEntry = {
            event,
            reason,
            droppedAt: new Date().toISOString(),
        };

        log.warn({ reason, correlationId: event?.correlationId }, 'Routing event to DLQ');

        try {
            await redis.lpush(this.REDIS_KEY, JSON.stringify(dlqEntry));
            await redis.ltrim(this.REDIS_KEY, 0, this.MAX_SIZE - 1); // Cap size
        } catch (err) {
            log.error({ err }, 'Failed to push to Redis DLQ, logging to console');
            console.error('CRITICAL_DLQ_LOSS', dlqEntry);
        }
    }

    async getRecent(count: number = 10): Promise<any[]> {
        try {
            const items = await redis.lrange(this.REDIS_KEY, 0, count - 1);
            return items.map((i: string) => JSON.parse(i));
        } catch (err) {
            log.error({ err }, 'Failed to fetch from DLQ');
            return [];
        }
    }
}

export const dlq = new DeadLetterQueue();
