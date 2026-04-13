import { VenueEvent, HealthTier } from './types.js';
import logger, { createLogger } from './logger.js';

const log = createLogger('EventBus');

export interface IEventBus {
    publish(event: VenueEvent): Promise<void>;
    subscribe(topic: string, subscriber: (event: VenueEvent) => Promise<void>): void;
    healthCheck(): HealthTier;
}

export class InMemoryEventBus implements IEventBus {
    private subscribers: Map<string, Array<(event: VenueEvent) => Promise<void>>> = new Map();
    private readonly MAX_QUEUE_DEPTH = 5000;
    private topicQueues: Map<string, number> = new Map(); // Current count of pending events for backpressure checks

    async publish(event: VenueEvent): Promise<void> {
        const topic = event.type;
        const listeners = this.subscribers.get(topic) || [];
        
        if (listeners.length === 0) {
            log.debug({ topic, correlationId: event.correlationId }, 'No subscribers for topic');
            return;
        }

        // Backpressure check
        const currentDepth = this.topicQueues.get(topic) || 0;
        if (currentDepth >= this.MAX_QUEUE_DEPTH) {
            log.warn({ topic, depth: currentDepth, correlationId: event.correlationId }, 'Backpressure: Topic queue full. Dropping older events (Simulation: dropping current).');
            // In a real ring buffer, we'd drop the oldest. For this demo, we drop the incoming to protect the heap.
            return;
        }

        this.topicQueues.set(topic, currentDepth + 1);

        // Standardize event metadata
        event.servicePath = [...(event.servicePath || []), 'EventBus'];
        event.timestamp = event.timestamp || Date.now();

        // Async dispatch
        listeners.forEach(async (subscriber) => {
            try {
                await subscriber(event);
            } catch (err) {
                log.error({ err, topic, correlationId: event.correlationId }, 'Subscriber processing error');
                // Potential DLQ routing logic would go here
            } finally {
                const updatedDepth = this.topicQueues.get(topic) || 1;
                this.topicQueues.set(topic, Math.max(0, updatedDepth - 1));
            }
        });
    }

    subscribe(topic: string, subscriber: (event: VenueEvent) => Promise<void>): void {
        const listeners = this.subscribers.get(topic) || [];
        listeners.push(subscriber);
        this.subscribers.set(topic, listeners);
        log.info({ topic }, 'New subscription registered');
    }

    healthCheck(): HealthTier {
        let maxDepth = 0;
        for (const depth of this.topicQueues.values()) {
            if (depth > maxDepth) maxDepth = depth;
        }

        if (maxDepth >= this.MAX_QUEUE_DEPTH * 0.9) return HealthTier.MINIMAL;
        if (maxDepth >= this.MAX_QUEUE_DEPTH * 0.5) return HealthTier.DEGRADED;
        return HealthTier.FULL;
    }
}

export const eventBus = new InMemoryEventBus();
