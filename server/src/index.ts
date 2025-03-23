import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import connectDB from './config/database';
import { connectRedis } from './config/redis';
import ENV from './config/environment';
import { notFound, errorHandler } from './middleware/errorHandler';
import userRoutes from './routes/userRoutes';
import VideoChatService from './services/videoChatService';
import logger from './utils/logger';
import { setupStaticFiles } from './static-handler';

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Debug information
logger.info(`Starting server in ${ENV.NODE_ENV} mode on port ${ENV.PORT}`);
logger.info(`CORS_ORIGIN set to: ${ENV.CORS_ORIGIN}`);

// Connect to MongoDB
connectDB();

// Connect to Redis
connectRedis();

// Configure CORS
const corsOptions = {
  origin: ENV.CORS_ORIGIN,
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
  crossOriginResourcePolicy: { policy: 'cross-origin' }
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

// Routes
app.use('/api/users', userRoutes);

// Ensure public directory and index.html exist
const ensurePublicDirectories = () => {
  // Create public directory if it doesn't exist
  if (!fs.existsSync(ENV.PUBLIC_DIR)) {
    try {
      fs.mkdirSync(ENV.PUBLIC_DIR, { recursive: true });
      logger.info(`Created public directory: ${ENV.PUBLIC_DIR}`);
    } catch (error) {
      logger.error(`Failed to create public directory: ${error}`);
    }
  }

  // Create videos directory if it doesn't exist
  const videosDir = path.join(ENV.PUBLIC_DIR, 'videos');
  if (!fs.existsSync(videosDir)) {
    try {
      fs.mkdirSync(videosDir, { recursive: true });
      logger.info(`Created videos directory: ${videosDir}`);
    } catch (error) {
      logger.error(`Failed to create videos directory: ${error}`);
    }
  }

  // Look for React build files
  const clientBuildDir = path.join(__dirname, '../../../client/build');
  const clientBuildExists = fs.existsSync(clientBuildDir);
  const clientIndexExists = fs.existsSync(path.join(clientBuildDir, 'index.html'));
  
  // Also check the exact Render.com path
  const renderClientBuildDir = '/opt/render/project/src/client/build';
  const renderClientBuildExists = fs.existsSync(renderClientBuildDir);
  const renderClientIndexExists = renderClientBuildExists && fs.existsSync(path.join(renderClientBuildDir, 'index.html'));
  
  if ((clientBuildExists && clientIndexExists) || (renderClientBuildExists && renderClientIndexExists)) {
    const sourceBuildDir = renderClientBuildExists ? renderClientBuildDir : clientBuildDir;
    logger.info(`Found React build files at ${sourceBuildDir}, copying to public directory...`);
    try {
      // Copy all build files
      const files = fs.readdirSync(sourceBuildDir);
      files.forEach(file => {
        const srcPath = path.join(sourceBuildDir, file);
        const destPath = path.join(ENV.PUBLIC_DIR, file);
        
        if (fs.statSync(srcPath).isDirectory()) {
          // If it's a directory, copy recursively
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          
          const dirFiles = fs.readdirSync(srcPath);
          dirFiles.forEach(dirFile => {
            const dirSrcPath = path.join(srcPath, dirFile);
            const dirDestPath = path.join(destPath, dirFile);
            if (fs.statSync(dirSrcPath).isFile()) {
              fs.copyFileSync(dirSrcPath, dirDestPath);
            }
          });
        } else {
          // Simple file copy
          fs.copyFileSync(srcPath, destPath);
        }
      });
      logger.info('Successfully copied React build files to public directory');
      return; // Exit early, no need to create a basic index.html
    } catch (error) {
      logger.error(`Failed to copy React build files: ${error}`);
    }
  } else {
    logger.warn(`React build files not found at ${clientBuildDir} or ${renderClientBuildDir}, will use basic index.html`);
  }

  // Create an empty index.html if it doesn't exist
  const indexPath = path.join(ENV.PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    logger.warn(`index.html not found at ${indexPath}, creating a basic one...`);
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
      fs.writeFileSync(indexPath, basicHtml);
      logger.info('Created basic index.html');
    } catch (error) {
      logger.error('Failed to create index.html', error);
    }
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  // Ensure directories exist first
  ensurePublicDirectories();
  
  // Check for static files
  const publicDir = ENV.PUBLIC_DIR;
  const videosDir = path.join(publicDir, 'videos');
  
  // Check if directories exist
  const publicExists = fs.existsSync(publicDir);
  const videosExist = fs.existsSync(videosDir);
  
  // Count video files
  let videoCount = 0;
  if (videosExist) {
    const files = fs.readdirSync(videosDir);
    videoCount = files.filter(file => file.endsWith('.mp4')).length;
  }
  
  // Check if index.html exists
  const indexExists = fs.existsSync(path.join(publicDir, 'index.html'));
  
  res.status(200).json({ 
    status: 'ok',
    environment: ENV.NODE_ENV,
    publicDirectoryExists: publicExists,
    videosDirectoryExists: videosExist,
    indexHtmlExists: indexExists,
    videoCount: videoCount,
    videosDir: videosDir,
    publicDir: publicDir,
    corsOrigin: ENV.CORS_ORIGIN,
    isRender: ENV.IS_RENDER
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
if (ENV.NODE_ENV === 'production') {
  // Ensure directories and index.html exist
  ensurePublicDirectories();
  
  // Setup static file handling
  setupStaticFiles(app, ENV.PUBLIC_DIR);
} else {
  // For development, specifically serve the videos folder
  app.use('/videos', express.static(path.join(ENV.PUBLIC_DIR, 'videos')));
}

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