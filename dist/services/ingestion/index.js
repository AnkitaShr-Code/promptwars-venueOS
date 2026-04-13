import { ZoneType } from '../../shared/types.js';
import { eventBus } from '../../shared/event-bus.js';
import { createLogger, getCorrelationId } from '../../shared/logger.js';
import { dlq } from '../../shared/dlq.js';
const log = createLogger('IngestionService');
const VERSION = '1.0.0';
// REACHABILITY WEIGHTS (V4 Mandate)
const REACHABILITY_WEIGHTS = {
    [ZoneType.GATE]: 1.8, // 55% app reach
    [ZoneType.CONCOURSE]: 1.5, // 66% app reach
    [ZoneType.STALL]: 1.3 // 75% app reach
};
export class CrowdIngestionService {
    lastUpdateBuffer = new Map();
    smaWindow = new Map();
    WINDOW_SIZE = 5;
    INTERPOLATION_GAP_MS = 5000;
    /**
     * Handles a turnstile/gate entry or exit pulse
     */
    async ingestAccessPulse(gateId, accessType, count = 1) {
        const correlationId = getCorrelationId();
        const event = {
            schemaVersion: VERSION,
            correlationId,
            timestamp: Date.now(),
            servicePath: ['IngestionService'],
            type: 'venue.access',
            accessType,
            gateId,
            count
        };
        log.debug({ gateId, accessType, correlationId }, 'Ingesting access pulse');
        await eventBus.publish(event);
    }
    /**
     * Handles noisy sensor data (e.g. Camera or GPS counts)
     */
    async ingestSensedCrowd(zoneId, zoneType, rawCount, confidence) {
        const correlationId = getCorrelationId();
        // 1. Validation
        if (rawCount < 0 || confidence < 0 || confidence > 1) {
            await dlq.push({ zoneId, rawCount, confidence }, 'Invalid sensor data');
            return;
        }
        // 2. Apply reachability multiplier (Phantom Load)
        const weight = REACHABILITY_WEIGHTS[zoneType] || 1.0;
        const adjustedCount = Math.round(rawCount * weight);
        // 3. SMA Filtering (Smoothing)
        const window = this.smaWindow.get(zoneId) || [];
        window.push(adjustedCount);
        if (window.length > this.WINDOW_SIZE)
            window.shift();
        this.smaWindow.set(zoneId, window);
        const smoothedCount = Math.round(window.reduce((a, b) => a + b, 0) / window.length);
        const event = {
            schemaVersion: VERSION,
            correlationId,
            timestamp: Date.now(),
            servicePath: ['IngestionService'],
            type: 'sensed.crowd',
            zoneId,
            zoneType,
            count: smoothedCount,
            confidence
        };
        log.info({ zoneId, rawCount, smoothedCount, correlationId }, 'Ingested sensed crowd data');
        // Update buffer for interpolation
        this.lastUpdateBuffer.set(zoneId, { count: smoothedCount, timestamp: Date.now(), type: zoneType });
        await eventBus.publish(event);
    }
    /**
     * Watchdog method to interpolate missing data points
     */
    async checkAndInterpolate() {
        const now = Date.now();
        for (const [zoneId, last] of this.lastUpdateBuffer.entries()) {
            if (now - last.timestamp > this.INTERPOLATION_GAP_MS) {
                log.warn({ zoneId, msSinceLast: now - last.timestamp }, 'Gap detected, interpolating data');
                // Linear decay interpolation (assuming people don't teleport)
                // For this demo, we use the last known count with a slight decay
                await this.ingestSensedCrowd(zoneId, last.type, last.count * 0.95, 0.5);
            }
        }
    }
}
export const ingestionService = new CrowdIngestionService();
//# sourceMappingURL=index.js.map