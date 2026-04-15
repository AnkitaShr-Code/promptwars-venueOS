import './gateway/index.js'; // Starts Gateway
import './services/ingestion/index.js';
import './services/processing/index.js';
import './services/prediction/index.js';
import './services/notification/index.js';
import './services/dashboard/index.js';
import { simulation } from './simulation.js';
import { createLogger } from './shared/logger.js';
import { redis } from './shared/redis.js';

const log = createLogger('Main');

async function bootstrap() {
    log.info('VenueOS Bootstrapping...');

    // Clear stale state for demo consistency
    await redis.flushall();
    log.info('Redis state flushed for clean simulation');

    // Start the scripted demo scenario — all phases run automatically
    simulation.start();

    log.info('VenueOS fully operational. Demo scenario running...');
}

bootstrap().catch(err => {
    log.error({ err }, 'Fatal bootstrap error');
    process.exit(1);
});
