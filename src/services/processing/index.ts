import { 
    VenueEvent, 
    AccessEvent, 
    SensedCrowdEvent, 
    VenueStateUpdate, 
    CongestionAlert,
    AccessType,
    HealthTier
} from '../../shared/types.js';
import { eventBus } from '../../shared/event-bus.js';
import { redis } from '../../shared/redis.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('ProcessingEngine');

const GLOBAL_MAX_CAPACITY = 50000;
const CONGESTION_THRESHOLD = 0.8;
const RECOVERY_THRESHOLD = 0.7;
const DECAY_LAMBDA = 0.01; // Decay rate for compliance curve

export class CrowdProcessingEngine {
    private readonly OCCUPANCY_KEY = 'venue:occupancy';
    private readonly ALERT_PREFIX = 'alert:active:';
    private readonly DIVERSION_PREFIX = 'diversion:last:';

    constructor() {
        this.initializeSubscriptions();
    }

    private initializeSubscriptions() {
        eventBus.subscribe('venue.access', (e) => this.handleAccessEvent(e as AccessEvent));
        eventBus.subscribe('sensed.crowd', (e) => this.handleSensedEvent(e as SensedCrowdEvent));
    }

    /**
     * Updates the ground-truth occupancy tally
     */
    async handleAccessEvent(event: AccessEvent) {
        const delta = event.accessType === AccessType.ENTRY ? event.count : -event.count;
        let newTotal = await redis.incrby(this.OCCUPANCY_KEY, delta);
        
        // Prevent negative occupancy 
        if (newTotal < 0) {
            newTotal = 0;
            await redis.set(this.OCCUPANCY_KEY, '0');
        }

        log.debug({ delta, newTotal, correlationId: event.correlationId }, 'Global occupancy updated');

        await eventBus.publish({
            type: 'update.venue',
            schemaVersion: '1.0.0',
            correlationId: event.correlationId,
            timestamp: Date.now(),
            servicePath: ['ProcessingEngine'],
            totalOccupancy: newTotal
        } as VenueStateUpdate);
    }

    /**
     * Processes spatial density and manages hysteresis alerts
     */
    async handleSensedEvent(event: SensedCrowdEvent) {
        const zoneId = event.zoneId;
        const rawDensity = event.count / 1000; // Normalized density (assume 1000 cap per zone for demo)
        
        // 1. APPLY COMPLIANCE DECAY (V4 Mandate)
        const adjustedDensity = await this.applyComplianceDecay(zoneId, rawDensity);

        log.info({ zoneId, rawDensity, adjustedDensity, correlationId: event.correlationId }, 'Zone density processed');

        // 2. HYSTERESIS LOGIC (No-Flap Alerts)
        const alertKey = `${this.ALERT_PREFIX}${zoneId}`;
        const isAlertActive = (await redis.get(alertKey)) === 'true';

        if (!isAlertActive && adjustedDensity >= CONGESTION_THRESHOLD) {
            await this.triggerAlert(zoneId, 'HIGH', 'Congestion detected. Threshold exceeded.', event.correlationId);
        } else if (isAlertActive && adjustedDensity <= RECOVERY_THRESHOLD) {
            await this.clearAlert(zoneId, event.correlationId);
        }

        // 3. BROADCAST UPDATE
        await eventBus.publish({
            type: 'update.venue',
            schemaVersion: '1.0.0',
            correlationId: event.correlationId,
            timestamp: Date.now(),
            servicePath: ['ProcessingEngine'],
            zoneId,
            density: adjustedDensity
        } as VenueStateUpdate);
    }

    private async applyComplianceDecay(zoneId: string, rawDensity: number): Promise<number> {
        const diversionTime = await redis.get(`${this.DIVERSION_PREFIX}${zoneId}`);
        if (!diversionTime) return rawDensity;

        const t = (Date.now() - parseInt(diversionTime)) / 1000;
        // Projection: Density * (1 - Reachability * Compliance * Decay)
        // Static params for demo: 60% reached, 50% complied
        const projectionFactor = 1 - (0.6 * 0.5 * Math.exp(-DECAY_LAMBDA * t));
        return rawDensity * Math.max(0.7, projectionFactor); 
    }

    private async triggerAlert(zoneId: string, severity: any, message: string, correlationId: string) {
        log.warn({ zoneId, severity }, 'ACTivating congestion alert');
        await redis.set(`${this.ALERT_PREFIX}${zoneId}`, 'true');
        
        await eventBus.publish({
            type: 'alert.crowd',
            schemaVersion: '1.0.0',
            correlationId,
            timestamp: Date.now(),
            servicePath: ['ProcessingEngine'],
            zoneId,
            severity,
            message
        } as CongestionAlert);
    }

    private async clearAlert(zoneId: string, correlationId: string) {
        log.info({ zoneId }, 'CLEARing congestion alert');
        await redis.del(`${this.ALERT_PREFIX}${zoneId}`);
        
        await eventBus.publish({
            type: 'alert.crowd',
            schemaVersion: '1.0.0',
            correlationId,
            timestamp: Date.now(),
            servicePath: ['ProcessingEngine'],
            zoneId,
            severity: 'LOW',
            message: 'Congestion cleared.'
        } as CongestionAlert);
    }
}

export const processingEngine = new CrowdProcessingEngine();
