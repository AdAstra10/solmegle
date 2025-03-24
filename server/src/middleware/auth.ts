import { Request, Response, NextFunction } from 'express';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import ENV from '../config/environment';
import { AppError } from './errorHandler';

interface JwtPayload {
  id: string;
  username: string;
  iat: number;
  exp: number;
}

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let token;

  // Check for token in headers or cookies
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    const error = new Error('Not authorized, no token') as AppError;
    error.statusCode = 401;
    return next(error);
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    const err = new Error('Not authorized, token failed') as AppError;
    err.statusCode = 401;
    next(err);
  }
};

// Generate JWT Token
export const generateToken = (id: string, username: string): string => {
  const payload = { id, username };
  const secret = ENV.JWT_SECRET as Secret;
  // Use a fixed value for expiration to avoid TypeScript issues
  const options: SignOptions = { expiresIn: '30d' };
  
  return jwt.sign(payload, secret, options);
}; 