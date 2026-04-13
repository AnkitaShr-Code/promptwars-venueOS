import express from 'express';
import rateLimit from 'express-rate-limit';
import proxy from 'express-http-proxy';
import cors from 'cors';
import { createLogger } from '../shared/logger.js';
const log = createLogger('APIGateway');
const app = express();
const PORT = process.env.GATEWAY_PORT || 3000;
const DASHBOARD_API_URL = process.env.DASHBOARD_API_URL || 'localhost:3001';
// 1. Rate Limiting (V4 Mandate)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);
app.use(cors());
// 2. Traffic Logging
app.use((req, res, next) => {
    log.info({ method: req.method, url: req.url, ip: req.ip }, 'Traffic pulse');
    next();
});
// 3. Proxy to Dashboard API
app.use('/', proxy(DASHBOARD_API_URL, {
    proxyReqPathResolver: (req) => req.url,
    userResDecorator: (proxyRes, proxyResData) => {
        // Here we could inject auth verification if required
        return proxyResData;
    }
}));
app.listen(PORT, () => {
    log.info(`API Gateway listening on port ${PORT}`);
});
//# sourceMappingURL=index.js.map