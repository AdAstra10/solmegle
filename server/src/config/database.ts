import mongoose from 'mongoose';
import ENV from './environment';
import logger from '../utils/logger';

const connectDB = async (): Promise<void> => {
  // Skip MongoDB connection if URI is not provided in production
  if (!ENV.MONGODB_URI && ENV.NODE_ENV === 'production') {
    logger.info('MongoDB URI not provided in production. Running without database.');
    return;
  }
  
  try {
    if (!ENV.MONGODB_URI) {
      throw new Error('MongoDB URI is required but not provided');
    }
    
    // Set connection options
    const options = {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      family: 4 // Force IPv4 instead of trying IPv6 first
    };
    
    const connection = await mongoose.connect(ENV.MONGODB_URI, options);
    logger.info(`MongoDB Connected: ${connection.connection.host}`);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error connecting to MongoDB: ${error.message}`);
    } else {
      logger.error('Unknown error connecting to MongoDB');
    }
    
    // Only exit in non-production environments
    if (ENV.NODE_ENV !== 'production') {
      process.exit(1);
    } else {
      logger.warn('Continuing without MongoDB in production mode. Some features may not work.');
    }
  }
};

export default connectDB; 