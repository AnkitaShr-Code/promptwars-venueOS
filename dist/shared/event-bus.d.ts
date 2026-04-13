import { VenueEvent, HealthTier } from './types.js';
export interface IEventBus {
    publish(event: VenueEvent): Promise<void>;
    subscribe(topic: string, subscriber: (event: VenueEvent) => Promise<void>): void;
    healthCheck(): HealthTier;
}
export declare class InMemoryEventBus implements IEventBus {
    private subscribers;
    private readonly MAX_QUEUE_DEPTH;
    private topicQueues;
    publish(event: VenueEvent): Promise<void>;
    subscribe(topic: string, subscriber: (event: VenueEvent) => Promise<void>): void;
    healthCheck(): HealthTier;
}
export declare const eventBus: InMemoryEventBus;
