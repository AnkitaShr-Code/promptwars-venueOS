import CircuitBreaker from 'opossum';
import { eventBus } from '../../shared/event-bus.js';
import { redis } from '../../shared/redis.js';
import { createLogger } from '../../shared/logger.js';
const log = createLogger('NotificationService');
// REACHABILITY (V4 Mandate)
const APP_REACHABILITY_FRACTION = 0.6;
export class NotificationService {
    pushBreaker;
    FATIGUE_TTL = 300; // 5 minutes between alerts for same zone/user
    constructor() {
        // Circuit Breaker Config
        const options = {
            timeout: 3000,
            errorThresholdPercentage: 50,
            resetTimeout: 10000
        };
        this.pushBreaker = new CircuitBreaker(this.mockPushProvider.bind(this), options);
        this.pushBreaker.on('open', () => log.warn('Circuit Breaker OPEN: Push provider is failing'));
        this.pushBreaker.on('halfOpen', () => log.info('Circuit Breaker HALF_OPEN: Testing push provider'));
        this.pushBreaker.on('close', () => log.info('Circuit Breaker CLOSED: Push provider restored'));
        eventBus.subscribe('alert.crowd', (e) => this.handleAlert(e));
    }
    async handleAlert(event) {
        const { zoneId, severity, message, correlationId } = event;
        // 1. REACHABILITY FILTER
        if (Math.random() > APP_REACHABILITY_FRACTION) {
            log.debug({ zoneId, correlationId }, 'User not reachable (No App)');
            return;
        }
        // 2. FATIGUE CONTROL (Rate Limiting)
        const fatigueKey = `fatigue:zone:${zoneId}`;
        const hasRecentlyNotified = await redis.get(fatigueKey);
        if (hasRecentlyNotified) {
            log.info({ zoneId, correlationId }, 'Notification suppressed due to user fatigue control');
            return;
        }
        // 3. DISPATCH WITH CIRCUIT BREAKER
        try {
            await this.pushBreaker.fire(event);
            await redis.set(fatigueKey, 'true', 'EX', this.FATIGUE_TTL);
            log.info({ zoneId, severity, correlationId }, 'Notification dispatched successfully');
        }
        catch (err) {
            log.error({ err, zoneId, correlationId }, 'Notification dispatch failed');
        }
    }
    /**
     * Simulated external push notification provider (e.g. Firebase, OneSignal)
     */
    async mockPushProvider(alert) {
        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, 100));
        // Simulate random failure (5% chance) to test circuit breaker
        if (Math.random() < 0.05) {
            throw new Error('Push Provider Internal Server Error');
        }
        log.debug({ alert }, 'EXT_CALL: SMS/Push delivered');
    }
}
export const notificationService = new NotificationService();
//# sourceMappingURL=index.js.map