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
exports.generateToken = exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const environment_1 = __importDefault(require("../config/environment"));
const protect = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    let token;
    // Check for token in headers or cookies
    if (req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }
    if (!token) {
        const error = new Error('Not authorized, no token');
        error.statusCode = 401;
        return next(error);
    }
    try {
        // Verify token
        const decoded = jsonwebtoken_1.default.verify(token, environment_1.default.JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (error) {
        const err = new Error('Not authorized, token failed');
        err.statusCode = 401;
        next(err);
    }
});
exports.protect = protect;
// Generate JWT Token
const generateToken = (id, username) => {
    const payload = { id, username };
    const secret = environment_1.default.JWT_SECRET;
    // Use a fixed value for expiration to avoid TypeScript issues
    const options = { expiresIn: '30d' };
    return jsonwebtoken_1.default.sign(payload, secret, options);
};
exports.generateToken = generateToken;
