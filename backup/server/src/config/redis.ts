import { createClient } from 'redis';
import ENV from './environment';
import logger from '../utils/logger';

const redisClient = createClient({ url: ENV.REDIS_URL });

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.on('connect', () => logger.info('Redis Client Connected'));
redisClient.on('reconnecting', () => logger.info('Redis Client Reconnecting'));
redisClient.on('ready', () => logger.info('Redis Client Ready'));

const connectRedis = async (): Promise<void> => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error connecting to Redis: ${error.message}`);
    } else {
      logger.error('Unknown error connecting to Redis');
    }
    process.exit(1);
  }
};

export { redisClient, connectRedis }; 