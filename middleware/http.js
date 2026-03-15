import { Logger } from '../utils/logger.js';

export function loggerMiddleware(req, res, next) {
    Logger.log('HTTP', `${req.method} ${req.path}`);
    next();
}
