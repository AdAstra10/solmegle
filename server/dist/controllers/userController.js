"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserProfile = exports.logoutUser = exports.walletAuth = exports.loginUser = exports.registerUser = void 0;
const User_1 = __importDefault(require("../models/User"));
const auth_1 = require("../middleware/auth");
const logger_1 = __importDefault(require("../utils/logger"));
// @desc    Register a new user
// @route   POST /api/users
// @access  Public
const registerUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username, email, password } = req.body;
        // Check if user already exists
        const userExists = yield User_1.default.findOne({ $or: [{ email }, { username }] });
        if (userExists) {
            const error = new Error('User already exists');
            error.statusCode = 400;
            return next(error);
        }
        // Create user
        const user = yield User_1.default.create({
            username,
            email,
            password,
        });
        if (user) {
            // Create token
            const token = (0, auth_1.generateToken)(user._id.toString(), user.username);
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
        }
        else {
            const error = new Error('Invalid user data');
            error.statusCode = 400;
            return next(error);
        }
    }
    catch (error) {
        logger_1.default.error('Error in registerUser:', error);
        next(error);
    }
});
exports.registerUser = registerUser;
// @desc    Login user & get token
// @route   POST /api/users/login
// @access  Public
const loginUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username, password } = req.body;
        // Find user by username
        const user = yield User_1.default.findOne({ username });
        if (!user) {
            const error = new Error('Invalid credentials');
            error.statusCode = 401;
            return next(error);
        }
        // Check if password matches
        const isMatch = yield user.comparePassword(password);
        if (!isMatch) {
            const error = new Error('Invalid credentials');
            error.statusCode = 401;
            return next(error);
        }
        // Update user status
        user.isOnline = true;
        user.lastActive = new Date();
        yield user.save();
        // Create token
        const token = (0, auth_1.generateToken)(user._id.toString(), user.username);
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
    }
    catch (error) {
        logger_1.default.error('Error in loginUser:', error);
        next(error);
    }
});
exports.loginUser = loginUser;
// @desc    Authenticate with wallet address
// @route   POST /api/users/wallet-auth
// @access  Public
const walletAuth = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { walletAddress, username } = req.body;
        if (!walletAddress) {
            const error = new Error('Wallet address is required');
            error.statusCode = 400;
            return next(error);
        }
        // Find user by wallet address
        let user = yield User_1.default.findOne({ walletAddress });
        // If user doesn't exist, create one
        if (!user) {
            user = (yield User_1.default.create({
                username: username || `wallet_${walletAddress.slice(0, 5)}`,
                walletAddress,
            }));
        }
        // Update user status
        user.isOnline = true;
        user.lastActive = new Date();
        yield user.save();
        // Create token
        const token = (0, auth_1.generateToken)(user._id.toString(), user.username);
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
    }
    catch (error) {
        logger_1.default.error('Error in walletAuth:', error);
        next(error);
    }
});
exports.walletAuth = walletAuth;
// @desc    Logout user
// @route   POST /api/users/logout
// @access  Private
const logoutUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (req.user) {
            // Update user status
            yield User_1.default.findByIdAndUpdate(req.user.id, {
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
    }
    catch (error) {
        logger_1.default.error('Error in logoutUser:', error);
        next(error);
    }
});
exports.logoutUser = logoutUser;
// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            const error = new Error('Not authorized');
            error.statusCode = 401;
            return next(error);
        }
        const user = yield User_1.default.findById(req.user.id).select('-password');
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            return next(error);
        }
        res.json(user);
    }
    catch (error) {
        logger_1.default.error('Error in getUserProfile:', error);
        next(error);
    }
});
exports.getUserProfile = getUserProfile;
