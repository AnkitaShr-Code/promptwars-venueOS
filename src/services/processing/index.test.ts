import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { CrowdProcessingEngine } from './index.js';
import { eventBus } from '../../shared/event-bus.js';
import { SensedCrowdEvent, ZoneType, SchemaVersion, AccessType, AccessEvent } from '../../shared/types.js';
import { redis } from '../../shared/redis.js';

const VERSION: SchemaVersion = '1.0.0';

// Mock dependencies safely using spies due to ESM loading
jest.mock('../../shared/logger.js', () => ({
    createLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }),
    getCorrelationId: () => 'test-corr-id'
}));

describe('CrowdProcessingEngine', () => {
    let engine: CrowdProcessingEngine;
    let publishMock: jest.Spied<typeof eventBus.publish>;
    let redisGetMock: jest.Spied<typeof redis.get>;
    let redisSetMock: jest.Spied<typeof redis.set>;
    let redisDelMock: jest.Spied<typeof redis.del>;

    beforeEach(() => {
        jest.clearAllMocks();
        publishMock = jest.spyOn(eventBus, 'publish').mockResolvedValue(undefined);
        redisGetMock = jest.spyOn(redis, 'get').mockResolvedValue(null as any);
        redisSetMock = jest.spyOn(redis, 'set').mockResolvedValue('OK' as any);
        redisDelMock = jest.spyOn(redis, 'del').mockResolvedValue(1);
        engine = new CrowdProcessingEngine();
    });

    test('should trigger HIGH congestion alert when density >= 0.8', async () => {
        redisGetMock.mockResolvedValue(null as any);

        const event: SensedCrowdEvent = {
            schemaVersion: VERSION,
            type: 'sensed.crowd',
            correlationId: 'corr-id',
            timestamp: Date.now(),
            servicePath: [],
            zoneId: 'ZONE_A',
            zoneType: ZoneType.CONCOURSE,
            count: 850,
            confidence: 0.9
        };

        await engine.handleSensedEvent(event);

        // @ts-ignore
        expect(redisSetMock).toHaveBeenCalledWith('alert:active:ZONE_A', 'true');
        expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
            type: 'alert.crowd',
            severity: 'HIGH',
            zoneId: 'ZONE_A'
        }));
    });

    test('HYSTERESIS: should NOT clear alert if density drops to 0.75 (Must be <= 0.70)', async () => {
        redisGetMock.mockImplementation((key: any) => {
            if ((key as string).includes('alert:active')) return Promise.resolve('true');
            return Promise.resolve(null);
        });

        const event: SensedCrowdEvent = {
            schemaVersion: VERSION,
            type: 'sensed.crowd',
            correlationId: 'corr-id',
            timestamp: Date.now(),
            servicePath: [],
            zoneId: 'ZONE_A',
            zoneType: ZoneType.CONCOURSE,
            count: 750,
            confidence: 0.9
        };

        await engine.handleSensedEvent(event);

        expect(redisDelMock).not.toHaveBeenCalled();
        const clearEvent = publishMock.mock.calls.find(call => (call[0] as any).type === 'alert.crowd');
        expect(clearEvent).toBeUndefined();
    });

    test('HYSTERESIS: should clear alert once density is <= 0.70', async () => {
        redisGetMock.mockImplementation((key: any) => {
            if ((key as string).includes('alert:active')) return Promise.resolve('true');
            return Promise.resolve(null);
        });

        const event: SensedCrowdEvent = {
            schemaVersion: VERSION,
            type: 'sensed.crowd',
            correlationId: 'corr-id',
            timestamp: Date.now(),
            servicePath: [],
            zoneId: 'ZONE_A',
            zoneType: ZoneType.CONCOURSE,
            count: 650,
            confidence: 0.9
        };

        await engine.handleSensedEvent(event);

        // @ts-ignore
        expect(redisDelMock).toHaveBeenCalledWith('alert:active:ZONE_A');
        expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
            type: 'alert.crowd',
            severity: 'LOW',
            zoneId: 'ZONE_A',
        }));
    });

    test('should track global occupancy tally correctly', async () => {
        const incrbyMock = jest.spyOn(redis, 'incrby').mockResolvedValue(150);

        const event: AccessEvent = {
            schemaVersion: VERSION,
            type: 'venue.access',
            correlationId: 'corr-id',
            timestamp: Date.now(),
            servicePath: [],
            accessType: AccessType.ENTRY,
            gateId: 'GATE_1',
            count: 5
        };

        await engine.handleAccessEvent(event);

        expect(incrbyMock).toHaveBeenCalledWith('venue:occupancy', 5);
        expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
            type: 'update.venue',
            totalOccupancy: 150
        }));
    });
});
