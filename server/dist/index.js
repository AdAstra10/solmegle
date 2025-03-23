"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = require("express-rate-limit");
const database_1 = __importDefault(require("./config/database"));
const redis_1 = require("./config/redis");
const environment_1 = __importDefault(require("./config/environment"));
const errorHandler_1 = require("./middleware/errorHandler");
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const videoChatService_1 = __importDefault(require("./services/videoChatService"));
const logger_1 = __importDefault(require("./utils/logger"));
// Initialize Express app
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Connect to MongoDB
(0, database_1.default)();
// Connect to Redis
(0, redis_1.connectRedis)();
// Configure CORS - Update to fix the CORS issues
const corsOptions = {
    origin: environment_1.default.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
// Middleware
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use((0, morgan_1.default)('dev'));
// Rate limiting
const limiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: environment_1.default.RATE_LIMIT_WINDOW_MS,
    max: environment_1.default.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later',
});
app.use('/api', limiter);
// Routes
app.use('/api/users', userRoutes_1.default);
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
// Error handling
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
// Initialize Video Chat Service with socket.io
const videoChatService = new videoChatService_1.default(server);
// Start server
const PORT = environment_1.default.PORT;
server.listen(PORT, () => {
    logger_1.default.info(`Server running in ${environment_1.default.NODE_ENV} mode on port ${PORT}`);
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logger_1.default.error(`Unhandled Rejection: ${err.message}`);
    // Close server & exit process
    server.close(() => process.exit(1));
});
exports.default = server;
