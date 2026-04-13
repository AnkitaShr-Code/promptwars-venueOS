import './gateway/index.js'; // Starts Gateway
import './services/ingestion/index.js';
import './services/processing/index.js';
import './services/prediction/index.js';
import './services/notification/index.js';
import './services/dashboard/index.js';
import { simulation, DemoConfig } from './simulation.js';
import { createLogger } from './shared/logger.js';
import { redis } from './shared/redis.js';

const log = createLogger('Main');

async function bootstrap() {
    log.info('VenueOS Bootstrapping...');

    // Clear stale state for demo consistency
    await redis.flushall();
    log.info('Redis state flushed for clean simulation');

    // Note: Services are initialized via their static exports and constructors
    // They are now listening to the EventBus.
    
    // Start Simulation
    simulation.start();

    // Trigger Halftime mode configured by DemoConfig
    setTimeout(() => {
        simulation.triggerHalftime(true);
    }, DemoConfig.halftimeStartDelayMs);

    // Stop Halftime
    setTimeout(() => {
        simulation.triggerHalftime(false);
    }, DemoConfig.halftimeStartDelayMs + DemoConfig.halftimeDurationMs);

    log.info('VenueOS fully operational.');
}

bootstrap().catch(err => {
    log.error({ err }, 'Fatal bootstrap error');
    process.exit(1);
});
