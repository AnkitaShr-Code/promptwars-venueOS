import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { QueuePredictionService } from './index.js';
import { eventBus } from '../../shared/event-bus.js';
import { QueuePulseEvent, SchemaVersion } from '../../shared/types.js';

// Mock the logger
jest.mock('../../shared/logger.js', () => ({
    createLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }),
    getCorrelationId: () => 'test-correlation-id'
}));

const VERSION: SchemaVersion = '1.0.0';

describe('QueuePredictionService', () => {
    let service: QueuePredictionService;
    let publishMock: jest.Spied<typeof eventBus.publish>;

    beforeEach(() => {
        jest.clearAllMocks();
        publishMock = jest.spyOn(eventBus, 'publish').mockResolvedValue(undefined);
        service = new QueuePredictionService();
    });

    test('should predict 0 wait time for empty queue', async () => {
        await service['predict']('STALL_1', 'corr-id');
        
        // With 0 arrivals and departures, it falls back to heuristic.
        // length is 0, so wait time is 0.
        expect(publishMock).toHaveBeenCalledTimes(0); // Only publishes if there's pulse data
    });

    test('should calculate stable M/M/1 wait time when mu > lambda', async () => {
        const now = Date.now();
        const arrivals: number[] = [];
        const departures: number[] = [];
        
        for(let i=0; i<10; i++) arrivals.push(now - i * 1000);
        for(let i=0; i<20; i++) departures.push(now - i * 1000);

        service['stallData'].set('STALL_STABLE', {
            arrivals,
            departures,
            currentLength: 2
        });

        await service['predict']('STALL_STABLE', 'corr-id');

        expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
            type: 'update.queue',
            stallId: 'STALL_STABLE',
            queueLength: 2
        }));

        const emittedEvent = publishMock.mock.calls[0][0] as any;
        expect(emittedEvent.waitTimeSec).toBe(6);
    });

    test('should use heuristic fallback when unstable (lambda >= mu)', async () => {
        const now = Date.now();
        const arrivals: number[] = [];
        const departures: number[] = [];
        
        for(let i=0; i<30; i++) arrivals.push(now - i * 1000);
        for(let i=0; i<10; i++) departures.push(now - i * 1000);

        service['stallData'].set('STALL_UNSTABLE', {
            arrivals,
            departures,
            currentLength: 15 
        });

        await service['predict']('STALL_UNSTABLE', 'corr-id');

        const emittedEvent = publishMock.mock.calls[0][0] as any;
        expect(emittedEvent.waitTimeSec).toBe(90); 
    });
});
