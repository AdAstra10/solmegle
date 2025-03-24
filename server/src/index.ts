import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import connectDB from './config/database';
import { connectRedis } from './config/redis';
import ENV from './config/environment';
import { notFound, errorHandler } from './middleware/errorHandler';
import userRoutes from './routes/userRoutes';
import VideoChatService from './services/videoChatService';
import logger from './utils/logger';

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

// Connect to Redis
connectRedis();

// Configure CORS - Update to fix the CORS issues
const corsOptions = {
  origin: ENV.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 204,
  preflightContinue: false
};

// Middleware
app.use(cors(corsOptions));

// Enable pre-flight for all routes
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: ENV.RATE_LIMIT_WINDOW_MS,
  max: ENV.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later',
});
app.use('/api', limiter);

// Serve static files from the client build directory
const clientBuildPath = path.resolve(__dirname, '../../client/build');
// Explicitly set MIME types for common files
app.use(express.static(clientBuildPath, {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
  }
}));

// Fallback for public directory if client/build doesn't exist
const publicPath = path.resolve(__dirname, '../public');
app.use(express.static(publicPath, {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
  }
}));

// Routes
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Debug static files endpoint
app.get('/debug-static', (req, res) => {
  const clientBuildExists = require('fs').existsSync(clientBuildPath);
  const publicExists = require('fs').existsSync(publicPath);
  
  const clientFiles = clientBuildExists ? 
    require('fs').readdirSync(clientBuildPath).slice(0, 10) : [];
  const publicFiles = publicExists ? 
    require('fs').readdirSync(publicPath).slice(0, 10) : [];
  
  res.json({
    clientBuildPath,
    publicPath,
    clientBuildExists,
    publicExists,
    clientFiles,
    publicFiles,
    nodeEnv: process.env.NODE_ENV,
    cwd: process.cwd()
  });
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Initialize Video Chat Service with socket.io
const videoChatService = new VideoChatService(server);

// Start server
const PORT = ENV.PORT;
server.listen(PORT, () => {
  logger.info(`Server running in ${ENV.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

export default server; 