"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRedis = exports.redisClient = void 0;
const redis_1 = require("redis");
const environment_1 = __importDefault(require("./environment"));
const logger_1 = __importDefault(require("../utils/logger"));
const createRedisClient = () => {
    if (environment_1.default.REDIS_URL) {
        // Use socket.family = 4 to force IPv4 and avoid IPv6 issues on some providers
        return (0, redis_1.createClient)({
            url: environment_1.default.REDIS_URL,
            socket: {
                family: 4,
                reconnectStrategy: (retries) => {
                    // Limit reconnection attempts to 5
                    if (retries > 5) {
                        logger_1.default.warn('Redis connection failed after 5 attempts, stopping reconnection attempts');
                        return false; // Don't reconnect anymore
                    }
                    return Math.min(retries * 100, 3000); // Increase delay between attempts
                }
            }
        });
    }
    // Return a mock client if Redis URL is not available
    logger_1.default.info('Redis URL not provided. Using mock Redis client.');
    const mockClient = {
        isOpen: true, // Pretend we're connected to avoid reconnection attempts
        connect: () => __awaiter(void 0, void 0, void 0, function* () {
            logger_1.default.info('Mock Redis client connected');
            return Promise.resolve();
        }),
        on: (event, callback) => {
            if (event === 'ready') {
                setTimeout(() => callback(), 100);
            }
            return mockClient;
        },
        // Add any other methods you need to mock
        set: () => __awaiter(void 0, void 0, void 0, function* () { return Promise.resolve('OK'); }),
        get: () => __awaiter(void 0, void 0, void 0, function* () { return Promise.resolve(null); }),
        del: () => __awaiter(void 0, void 0, void 0, function* () { return Promise.resolve(1); }),
        exists: () => __awaiter(void 0, void 0, void 0, function* () { return Promise.resolve(0); })
    };
    return mockClient;
};
const redisClient = createRedisClient();
exports.redisClient = redisClient;
if (environment_1.default.REDIS_URL) {
    redisClient.on('error', (err) => logger_1.default.error('Redis Client Error', err));
    redisClient.on('connect', () => logger_1.default.info('Redis Client Connected'));
    redisClient.on('reconnecting', () => logger_1.default.info('Redis Client Reconnecting'));
    redisClient.on('ready', () => logger_1.default.info('Redis Client Ready'));
}
const connectRedis = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (environment_1.default.REDIS_URL) {
            if (!redisClient.isOpen) {
                yield redisClient.connect();
            }
        }
        else {
            logger_1.default.info('Skipping Redis connection - no REDIS_URL provided');
        }
    }
    catch (error) {
        // Log the error but don't exit the process in production
        if (error instanceof Error) {
            logger_1.default.error(`Error connecting to Redis: ${error.message}`);
        }
        else {
            logger_1.default.error('Unknown error connecting to Redis');
        }
        if (environment_1.default.NODE_ENV !== 'production') {
            process.exit(1);
        }
        else {
            logger_1.default.warn('Continuing without Redis in production mode');
        }
    }
});
exports.connectRedis = connectRedis;
