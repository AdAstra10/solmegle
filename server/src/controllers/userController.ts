import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { generateToken } from '../middleware/auth';
import logger from '../utils/logger';
import { Document } from 'mongoose';

interface UserDocument extends Document {
  _id: any;
  username: string;
  email?: string;
  walletAddress?: string;
  isOnline: boolean;
  lastActive: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ $or: [{ email }, { username }] });

    if (userExists) {
      const error = new Error('User already exists') as AppError;
      error.statusCode = 400;
      return next(error);
    }

    // Create user
    const user = await User.create({
      username,
      email,
      password,
    }) as UserDocument;

    if (user) {
      // Create token
      const token = generateToken(user._id.toString(), user.username);

      // Set HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.status(201).json({
        _id: user._id.toString(),
        username: user.username,
        email: user.email,
        token,
      });
    } else {
      const error = new Error('Invalid user data') as AppError;
      error.statusCode = 400;
      return next(error);
    }
  } catch (error) {
    logger.error('Error in registerUser:', error);
    next(error);
  }
};

// @desc    Login user & get token
// @route   POST /api/users/login
// @access  Public
export const loginUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { username, password } = req.body;

    // Find user by username
    const user = await User.findOne({ username }) as UserDocument;

    if (!user) {
      const error = new Error('Invalid credentials') as AppError;
      error.statusCode = 401;
      return next(error);
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      const error = new Error('Invalid credentials') as AppError;
      error.statusCode = 401;
      return next(error);
    }

    // Update user status
    user.isOnline = true;
    user.lastActive = new Date();
    await user.save();

    // Create token
    const token = generateToken(user._id.toString(), user.username);

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      token,
    });
  } catch (error) {
    logger.error('Error in loginUser:', error);
    next(error);
  }
};

// @desc    Authenticate with wallet address
// @route   POST /api/users/wallet-auth
// @access  Public
export const walletAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { walletAddress, username } = req.body;

    if (!walletAddress) {
      const error = new Error('Wallet address is required') as AppError;
      error.statusCode = 400;
      return next(error);
    }

    // Find user by wallet address
    let user = await User.findOne({ walletAddress }) as UserDocument | null;

    // If user doesn't exist, create one
    if (!user) {
      user = await User.create({
        username: username || `wallet_${walletAddress.slice(0, 5)}`,
        walletAddress,
      }) as UserDocument;
    }

    // Update user status
    user.isOnline = true;
    user.lastActive = new Date();
    await user.save();

    // Create token
    const token = generateToken(user._id.toString(), user.username);

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      _id: user._id.toString(),
      username: user.username,
      walletAddress: user.walletAddress,
      token,
    });
  } catch (error) {
    logger.error('Error in walletAuth:', error);
    next(error);
  }
};

// @desc    Logout user
// @route   POST /api/users/logout
// @access  Private
export const logoutUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.user) {
      // Update user status
      await User.findByIdAndUpdate(req.user.id, {
        isOnline: false,
        lastActive: new Date(),
      });
    }

    // Clear the cookie
    res.cookie('token', '', {
      httpOnly: true,
      expires: new Date(0),
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Error in logoutUser:', error);
    next(error);
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
export const getUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      const error = new Error('Not authorized') as AppError;
      error.statusCode = 401;
      return next(error);
    }

    const user = await User.findById(req.user.id).select('-password') as UserDocument;

    if (!user) {
      const error = new Error('User not found') as AppError;
      error.statusCode = 404;
      return next(error);
    }

    res.json(user);
  } catch (error) {
    logger.error('Error in getUserProfile:', error);
    next(error);
  }
}; 