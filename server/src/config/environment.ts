import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// For Render.com deployment, get the URL from the service
const getRenderUrl = () => {
  // Render sets IS_PULL_REQUEST and RENDER_SERVICE_ID vars
  if (process.env.RENDER_SERVICE_ID) {
    const serviceId = process.env.RENDER_SERVICE_ID;
    const isStaging = process.env.IS_PULL_REQUEST === 'true';
    const subdomain = isStaging ? `${serviceId}-staging` : serviceId;
    return `https://${subdomain}.onrender.com`;
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
      return renderUrl;
    }
  }
  
  // Default for development
  return 'http://localhost:3000';
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
  STUN_SERVERS: process.env.STUN_SERVERS?.split(',') || [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
  ],
  TURN_SERVERS: process.env.TURN_SERVERS || '',
  TURN_USERNAME: process.env.TURN_USERNAME || '',
  TURN_CREDENTIAL: process.env.TURN_CREDENTIAL || '',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // 100 requests per window
  RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID || '',
};

export default ENV; 