import express from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  getUserProfile,
  walletAuth,
} from '../controllers/userController';
import { protect } from '../middleware/auth';

const router = express.Router();

// @route   POST /api/users
// @desc    Register a new user
router.post('/', registerUser);

// @route   POST /api/users/login
// @desc    Login user & get token
router.post('/login', loginUser);

// @route   POST /api/users/wallet-auth
// @desc    Authenticate with wallet
router.post('/wallet-auth', walletAuth);

// @route   POST /api/users/logout
// @desc    Logout user
router.post('/logout', protect, logoutUser);

// @route   GET /api/users/profile
// @desc    Get user profile
router.get('/profile', protect, getUserProfile);

export default router; 