import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
        },
    },
});
export const createLogger = (serviceName) => {
    return logger.child({ svc: serviceName });
};
export const getCorrelationId = (existingId) => {
    return existingId || uuidv4();
};
export default logger;
//# sourceMappingURL=logger.js.map