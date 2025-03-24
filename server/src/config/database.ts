import mongoose from 'mongoose';
import ENV from './environment';
import logger from '../utils/logger';

const connectDB = async (): Promise<void> => {
  try {
    const connection = await mongoose.connect(ENV.MONGODB_URI);
    logger.info(`MongoDB Connected: ${connection.connection.host}`);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error connecting to MongoDB: ${error.message}`);
    } else {
      logger.error('Unknown error connecting to MongoDB');
    }
    process.exit(1);
  }
};

export default connectDB; 