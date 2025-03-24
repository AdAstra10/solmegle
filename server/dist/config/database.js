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
const mongoose_1 = __importDefault(require("mongoose"));
const environment_1 = __importDefault(require("./environment"));
const logger_1 = __importDefault(require("../utils/logger"));
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    // Skip MongoDB connection if URI is not provided in production
    if (!environment_1.default.MONGODB_URI && environment_1.default.NODE_ENV === 'production') {
        logger_1.default.info('MongoDB URI not provided in production. Running without database.');
        return;
    }
    try {
        if (!environment_1.default.MONGODB_URI) {
            throw new Error('MongoDB URI is required but not provided');
        }
        // Set connection options
        const options = {
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
            family: 4 // Force IPv4 instead of trying IPv6 first
        };
        const connection = yield mongoose_1.default.connect(environment_1.default.MONGODB_URI, options);
        logger_1.default.info(`MongoDB Connected: ${connection.connection.host}`);
    }
    catch (error) {
        if (error instanceof Error) {
            logger_1.default.error(`Error connecting to MongoDB: ${error.message}`);
        }
        else {
            logger_1.default.error('Unknown error connecting to MongoDB');
        }
        // Only exit in non-production environments
        if (environment_1.default.NODE_ENV !== 'production') {
            process.exit(1);
        }
        else {
            logger_1.default.warn('Continuing without MongoDB in production mode. Some features may not work.');
        }
    }
});
exports.default = connectDB;
