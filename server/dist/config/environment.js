"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Load environment variables from .env file
dotenv_1.default.config();
// For Render.com deployment, get the URL from the service
const getRenderUrl = () => {
    // Render sets IS_PULL_REQUEST and RENDER_SERVICE_ID vars
    if (process.env.RENDER_SERVICE_ID) {
        const serviceId = process.env.RENDER_SERVICE_ID;
        const isStaging = process.env.IS_PULL_REQUEST === 'true';
        const subdomain = isStaging ? `${serviceId}-staging` : serviceId;
        return `https://${subdomain}.onrender.com`;
    }
    // Also check for RENDER_EXTERNAL_URL which is set by Render
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL;
    }
    return null;
};
// Get CORS origin based on environment
const getCorsOrigin = () => {
    // If explicitly set, use that
    if (process.env.CORS_ORIGIN) {
        return process.env.CORS_ORIGIN;
    }
    // In production on Render, use the service URL
    if (process.env.NODE_ENV === 'production') {
        const renderUrl = getRenderUrl();
        if (renderUrl) {
            return [renderUrl, 'https://solmegle.onrender.com'];
        }
        // If we're in production but don't have Render URL, allow all origins
        return '*';
    }
    // Default for development
    return 'http://localhost:3000';
};
// Get the path to the public directory
const getPublicDir = () => {
    const defaultPath = path_1.default.join(__dirname, '../../../public');
    // Check if we're on Render
    if (process.env.RENDER) {
        // Render stores the app at /opt/render/project/src
        const renderPath = '/opt/render/project/src/public';
        // Ensure the directory exists
        if (!fs_1.default.existsSync(renderPath)) {
            try {
                fs_1.default.mkdirSync(renderPath, { recursive: true });
            }
            catch (error) {
                console.error('Failed to create public directory:', error);
            }
        }
        return renderPath;
    }
    return defaultPath;
};
const ENV = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '5001', 10),
    MONGODB_URI: process.env.MONGODB_URI || (process.env.NODE_ENV === 'production' ? '' : 'mongodb://localhost:27017/flexrocket'),
    REDIS_URL: process.env.REDIS_URL || (process.env.NODE_ENV === 'production' ? '' : 'redis://localhost:6379'),
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    CORS_ORIGIN: getCorsOrigin(),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    STUN_SERVERS: ((_a = process.env.STUN_SERVERS) === null || _a === void 0 ? void 0 : _a.split(',')) || [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
    ],
    TURN_SERVERS: process.env.TURN_SERVERS || '',
    TURN_USERNAME: process.env.TURN_USERNAME || '',
    TURN_CREDENTIAL: process.env.TURN_CREDENTIAL || '',
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // 100 requests per window
    RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID || '',
    RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL || '',
    IS_RENDER: !!process.env.RENDER,
    PUBLIC_DIR: getPublicDir(),
};
exports.default = ENV;
