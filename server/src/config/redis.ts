import { createClient } from 'redis';
import ENV from './environment';
import logger from '../utils/logger';

const createRedisClient = () => {
  if (ENV.REDIS_URL) {
    return createClient({ url: ENV.REDIS_URL });
  }
  
  // Return a mock client if Redis URL is not available
  logger.warn('Redis URL not provided. Using mock Redis client.');
  const mockClient = {
    isOpen: false,
    connect: async () => {
      logger.info('Mock Redis client connected');
      return Promise.resolve();
    },
    on: (event: string, callback: Function) => {
      if (event === 'ready') {
        setTimeout(() => callback(), 100);
      }
      return mockClient;
    },
    // Add any other methods you need to mock
    set: async () => Promise.resolve('OK'),
    get: async () => Promise.resolve(null),
    del: async () => Promise.resolve(1),
    exists: async () => Promise.resolve(0)
  };
  
  return mockClient as any;
};

const redisClient = createRedisClient();

if (ENV.REDIS_URL) {
  redisClient.on('error', (err: Error) => logger.error('Redis Client Error', err));
  redisClient.on('connect', () => logger.info('Redis Client Connected'));
  redisClient.on('reconnecting', () => logger.info('Redis Client Reconnecting'));
  redisClient.on('ready', () => logger.info('Redis Client Ready'));
}

const connectRedis = async (): Promise<void> => {
  try {
    if (ENV.REDIS_URL) {
      if (!redisClient.isOpen) {
        await redisClient.connect();
      }
    } else {
      logger.info('Skipping Redis connection - no REDIS_URL provided');
    }
  } catch (error) {
    // Log the error but don't exit the process in production
    if (error instanceof Error) {
      logger.error(`Error connecting to Redis: ${error.message}`);
    } else {
      logger.error('Unknown error connecting to Redis');
    }
    
    if (ENV.NODE_ENV !== 'production') {
      process.exit(1);
    } else {
      logger.warn('Continuing without Redis in production mode');
    }
  }
};

export { redisClient, connectRedis }; 