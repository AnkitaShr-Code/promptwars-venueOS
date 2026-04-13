import './gateway/index.js'; // Starts Gateway
import { simulation } from './simulation.js';
import { createLogger } from './shared/logger.js';
const log = createLogger('Main');
async function bootstrap() {
    log.info('VenueOS Bootstrapping...');
    // Note: Services are initialized via their static exports and constructors
    // They are now listening to the EventBus.
    // Start Simulation
    simulation.start();
    // Trigger Halftime mode after 10 seconds for demo purposes
    setTimeout(() => {
        simulation.triggerHalftime(true);
    }, 10000);
    // Stop Halftime after 20 seconds
    setTimeout(() => {
        simulation.triggerHalftime(false);
    }, 30000);
    log.info('VenueOS fully operational.');
}
bootstrap().catch(err => {
    log.error({ err }, 'Fatal bootstrap error');
    process.exit(1);
});
//# sourceMappingURL=index.js.map