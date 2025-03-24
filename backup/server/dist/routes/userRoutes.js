"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const userController_1 = require("../controllers/userController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// @route   POST /api/users
// @desc    Register a new user
router.post('/', userController_1.registerUser);
// @route   POST /api/users/login
// @desc    Login user & get token
router.post('/login', userController_1.loginUser);
// @route   POST /api/users/wallet-auth
// @desc    Authenticate with wallet
router.post('/wallet-auth', userController_1.walletAuth);
// @route   POST /api/users/logout
// @desc    Logout user
router.post('/logout', auth_1.protect, userController_1.logoutUser);
// @route   GET /api/users/profile
// @desc    Get user profile
router.get('/profile', auth_1.protect, userController_1.getUserProfile);
exports.default = router;
