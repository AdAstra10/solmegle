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
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
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
// Debug information
logger_1.default.info(`Starting server in ${environment_1.default.NODE_ENV} mode on port ${environment_1.default.PORT}`);
logger_1.default.info(`CORS_ORIGIN set to: ${environment_1.default.CORS_ORIGIN}`);
// Connect to MongoDB
(0, database_1.default)();
// Connect to Redis
(0, redis_1.connectRedis)();
// Configure CORS
const corsOptions = {
    origin: environment_1.default.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    optionsSuccessStatus: 204,
    preflightContinue: false
};
// Middleware
app.use((0, cors_1.default)(corsOptions));
// Enable pre-flight for all routes
app.options('*', (0, cors_1.default)(corsOptions));
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
// Ensure public directory and index.html exist
const ensurePublicDirectories = () => {
    // Create public directory if it doesn't exist
    if (!fs_1.default.existsSync(environment_1.default.PUBLIC_DIR)) {
        try {
            fs_1.default.mkdirSync(environment_1.default.PUBLIC_DIR, { recursive: true });
            logger_1.default.info(`Created public directory: ${environment_1.default.PUBLIC_DIR}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to create public directory: ${error}`);
        }
    }
    // Create videos directory if it doesn't exist
    const videosDir = path_1.default.join(environment_1.default.PUBLIC_DIR, 'videos');
    if (!fs_1.default.existsSync(videosDir)) {
        try {
            fs_1.default.mkdirSync(videosDir, { recursive: true });
            logger_1.default.info(`Created videos directory: ${videosDir}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to create videos directory: ${error}`);
        }
    }
    // Create an empty index.html if it doesn't exist
    const indexPath = path_1.default.join(environment_1.default.PUBLIC_DIR, 'index.html');
    if (!fs_1.default.existsSync(indexPath)) {
        logger_1.default.warn(`index.html not found at ${indexPath}, creating a basic one...`);
        const basicHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Solmegle</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
    h1 { color: #333; }
    p { margin-bottom: 30px; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Solmegle Video Chat</h1>
  <p>Welcome to Solmegle! The application is running.</p>
  <div id="root"></div>
</body>
</html>`;
        try {
            fs_1.default.writeFileSync(indexPath, basicHtml);
            logger_1.default.info('Created basic index.html');
        }
        catch (error) {
            logger_1.default.error('Failed to create index.html', error);
        }
    }
};
// Health check endpoint
app.get('/health', (req, res) => {
    // Ensure directories exist first
    ensurePublicDirectories();
    // Check for static files
    const publicDir = environment_1.default.PUBLIC_DIR;
    const videosDir = path_1.default.join(publicDir, 'videos');
    // Check if directories exist
    const publicExists = fs_1.default.existsSync(publicDir);
    const videosExist = fs_1.default.existsSync(videosDir);
    // Count video files
    let videoCount = 0;
    if (videosExist) {
        const files = fs_1.default.readdirSync(videosDir);
        videoCount = files.filter(file => file.endsWith('.mp4')).length;
    }
    // Check if index.html exists
    const indexExists = fs_1.default.existsSync(path_1.default.join(publicDir, 'index.html'));
    res.status(200).json({
        status: 'ok',
        environment: environment_1.default.NODE_ENV,
        publicDirectoryExists: publicExists,
        videosDirectoryExists: videosExist,
        indexHtmlExists: indexExists,
        videoCount: videoCount,
        videosDir: videosDir,
        publicDir: publicDir,
        corsOrigin: environment_1.default.CORS_ORIGIN,
        isRender: environment_1.default.IS_RENDER
    });
});
// CORS debugger endpoint
app.get('/debug/cors', (req, res) => {
    res.status(200).json({
        corsOptions,
        headers: req.headers,
        origin: req.headers.origin,
        clientAllowed: !corsOptions.origin || corsOptions.origin === '*' ||
            (Array.isArray(corsOptions.origin) && req.headers.origin &&
                corsOptions.origin.includes(req.headers.origin))
    });
});
// Serve static assets
if (environment_1.default.NODE_ENV === 'production') {
    // Ensure directories and index.html exist
    ensurePublicDirectories();
    // Set static folder
    logger_1.default.info(`Serving static files from: ${environment_1.default.PUBLIC_DIR}`);
    app.use(express_1.default.static(environment_1.default.PUBLIC_DIR));
    // Serve videos directory
    const videosDir = path_1.default.join(environment_1.default.PUBLIC_DIR, 'videos');
    logger_1.default.info(`Serving videos from: ${videosDir}`);
    app.use('/videos', express_1.default.static(videosDir));
    // All other routes should redirect to index.html
    app.get('*', (req, res) => {
        const indexPath = path_1.default.join(environment_1.default.PUBLIC_DIR, 'index.html');
        if (fs_1.default.existsSync(indexPath)) {
            res.sendFile(indexPath);
        }
        else {
            // If index.html still doesn't exist, create it and then send
            ensurePublicDirectories();
            if (fs_1.default.existsSync(indexPath)) {
                res.sendFile(indexPath);
            }
            else {
                res.status(500).send('Failed to serve index.html');
            }
        }
    });
}
else {
    // For development, specifically serve the videos folder
    app.use('/videos', express_1.default.static(path_1.default.join(environment_1.default.PUBLIC_DIR, 'videos')));
}
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
