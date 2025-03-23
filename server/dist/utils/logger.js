"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const environment_1 = __importDefault(require("../config/environment"));
const logger = winston_1.default.createLogger({
    level: environment_1.default.LOG_LEVEL,
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    defaultMeta: { service: 'flex-rocket-api' },
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple()),
        }),
    ],
});
// Add file transports in production
if (environment_1.default.NODE_ENV === 'production') {
    logger.add(new winston_1.default.transports.File({ filename: 'logs/error.log', level: 'error' }));
    logger.add(new winston_1.default.transports.File({ filename: 'logs/combined.log' }));
}
exports.default = logger;
