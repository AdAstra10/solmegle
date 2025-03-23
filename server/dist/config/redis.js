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
const redisClient = (0, redis_1.createClient)({ url: environment_1.default.REDIS_URL });
exports.redisClient = redisClient;
redisClient.on('error', (err) => logger_1.default.error('Redis Client Error', err));
redisClient.on('connect', () => logger_1.default.info('Redis Client Connected'));
redisClient.on('reconnecting', () => logger_1.default.info('Redis Client Reconnecting'));
redisClient.on('ready', () => logger_1.default.info('Redis Client Ready'));
const connectRedis = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!redisClient.isOpen) {
            yield redisClient.connect();
        }
    }
    catch (error) {
        if (error instanceof Error) {
            logger_1.default.error(`Error connecting to Redis: ${error.message}`);
        }
        else {
            logger_1.default.error('Unknown error connecting to Redis');
        }
        process.exit(1);
    }
});
exports.connectRedis = connectRedis;
