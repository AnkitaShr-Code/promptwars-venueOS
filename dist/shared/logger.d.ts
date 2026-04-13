import pino from 'pino';
declare const logger: pino.Logger<never, boolean>;
export declare const createLogger: (serviceName: string) => pino.Logger<never, boolean>;
export declare const getCorrelationId: (existingId?: string) => string;
export default logger;
