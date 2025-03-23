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
const socket_io_1 = require("socket.io");
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("../utils/logger"));
const ChatSession_1 = __importDefault(require("../models/ChatSession"));
const environment_1 = __importDefault(require("../config/environment"));
class VideoChatService {
    constructor(server) {
        this.waitingUsers = new Map();
        this.activeConnections = new Map(); // sessionId -> userIds
        this.userSessions = new Map(); // userId -> sessionId
        this.io = new socket_io_1.Server(server, {
            cors: {
                origin: environment_1.default.CORS_ORIGIN,
                methods: ['GET', 'POST'],
                credentials: true,
            },
        });
        this.setupSocketEvents();
    }
    setupSocketEvents() {
        this.io.on('connection', (socket) => {
            logger_1.default.info(`Socket connected: ${socket.id}`);
            // User joins the waiting queue for random chat
            socket.on('queue:join', (_a) => __awaiter(this, [_a], void 0, function* ({ userId, username }) {
                try {
                    // Check if user is already in a session
                    if (this.userSessions.has(userId)) {
                        const sessionId = this.userSessions.get(userId);
                        socket.emit('error', {
                            message: 'You are already in an active session'
                        });
                        return;
                    }
                    // Add user to waiting queue
                    this.addToWaitingQueue({ userId, username, socketId: socket.id, joinedAt: new Date() });
                    // Try to match waiting users
                    this.matchUsers();
                }
                catch (error) {
                    logger_1.default.error('Error in queue:join handler:', error);
                    socket.emit('error', { message: 'Failed to join queue' });
                }
            }));
            // User leaves the waiting queue
            socket.on('queue:leave', ({ userId }) => {
                try {
                    this.removeFromWaitingQueue(userId);
                    socket.emit('queue:left');
                }
                catch (error) {
                    logger_1.default.error('Error in queue:leave handler:', error);
                    socket.emit('error', { message: 'Failed to leave queue' });
                }
            });
            // Handle WebRTC signaling
            socket.on('signal', (data) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const { sessionId, to, signal } = data;
                    // Send the signal to the peer
                    this.io.to(to).emit('signal', {
                        sessionId,
                        from: socket.id,
                        signal,
                    });
                }
                catch (error) {
                    logger_1.default.error('Error in signal handler:', error);
                    socket.emit('error', { message: 'Failed to send signal' });
                }
            }));
            // Handle chat messages
            socket.on('chat:message', (data) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const { sessionId, sender, message } = data;
                    // Save message to database
                    yield this.saveMessage(sessionId, sender, message);
                    // Broadcast message to all participants in the session
                    const participants = this.activeConnections.get(sessionId);
                    if (participants) {
                        participants.forEach((userId) => {
                            // Get socket id for user
                            const userSocketId = this.findSocketIdByUserId(userId);
                            if (userSocketId && userSocketId !== socket.id) {
                                this.io.to(userSocketId).emit('chat:message', {
                                    sessionId,
                                    sender,
                                    message,
                                    timestamp: new Date(),
                                });
                            }
                        });
                    }
                }
                catch (error) {
                    logger_1.default.error('Error in chat:message handler:', error);
                    socket.emit('error', { message: 'Failed to send message' });
                }
            }));
            // End a chat session
            socket.on('session:end', (data) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const { sessionId, userId } = data;
                    if (sessionId) {
                        yield this.endSession(sessionId, userId);
                    }
                }
                catch (error) {
                    logger_1.default.error('Error in session:end handler:', error);
                    socket.emit('error', { message: 'Failed to end session' });
                }
            }));
            // Handle disconnection
            socket.on('disconnect', () => __awaiter(this, void 0, void 0, function* () {
                try {
                    logger_1.default.info(`Socket disconnected: ${socket.id}`);
                    // Find user by socket id
                    const userId = this.findUserIdBySocketId(socket.id);
                    if (userId) {
                        // Remove from waiting queue if present
                        this.removeFromWaitingQueue(userId);
                        // End active session if present
                        const sessionId = this.userSessions.get(userId);
                        if (sessionId) {
                            yield this.endSession(sessionId, userId);
                        }
                    }
                }
                catch (error) {
                    logger_1.default.error('Error in disconnect handler:', error);
                }
            }));
        });
    }
    findUserIdBySocketId(socketId) {
        for (const [userId, user] of this.waitingUsers.entries()) {
            if (user.socketId === socketId) {
                return userId;
            }
        }
        return null;
    }
    findSocketIdByUserId(userId) {
        const user = this.waitingUsers.get(userId);
        return user ? user.socketId : null;
    }
    addToWaitingQueue(user) {
        this.waitingUsers.set(user.userId, user);
        // Emit queue status update
        this.io.to(user.socketId).emit('queue:joined', {
            position: this.waitingUsers.size,
            estimatedWaitTime: this.calculateEstimatedWaitTime(),
        });
        logger_1.default.info(`User ${user.userId} joined waiting queue. Queue size: ${this.waitingUsers.size}`);
    }
    removeFromWaitingQueue(userId) {
        const user = this.waitingUsers.get(userId);
        if (user) {
            this.waitingUsers.delete(userId);
            logger_1.default.info(`User ${userId} left waiting queue. Queue size: ${this.waitingUsers.size}`);
        }
    }
    calculateEstimatedWaitTime() {
        // Simple calculation based on queue size
        // In a real implementation, this would be more sophisticated
        const queueSize = this.waitingUsers.size;
        // Average wait time in seconds
        return Math.max(5, Math.min(60, queueSize * 5));
    }
    matchUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.waitingUsers.size < 2)
                return;
            // Convert to array for easier manipulation
            const waitingArray = Array.from(this.waitingUsers.values());
            // Sort by join time (FIFO)
            waitingArray.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
            // Take first two users in queue
            const user1 = waitingArray[0];
            const user2 = waitingArray[1];
            if (user1 && user2) {
                try {
                    // Create a new session
                    const sessionId = (0, uuid_1.v4)();
                    // Remove users from waiting queue
                    this.removeFromWaitingQueue(user1.userId);
                    this.removeFromWaitingQueue(user2.userId);
                    // Add to active connections
                    const participants = new Set();
                    participants.add(user1.userId);
                    participants.add(user2.userId);
                    this.activeConnections.set(sessionId, participants);
                    // Map users to session
                    this.userSessions.set(user1.userId, sessionId);
                    this.userSessions.set(user2.userId, sessionId);
                    // Create a chat session in the database
                    yield this.createChatSession(sessionId, [user1.userId, user2.userId]);
                    // Emit session start event to both users
                    this.io.to(user1.socketId).emit('session:start', {
                        sessionId,
                        peer: {
                            userId: user2.userId,
                            username: user2.username,
                            socketId: user2.socketId,
                        },
                        iceServers: this.getIceServers(),
                    });
                    this.io.to(user2.socketId).emit('session:start', {
                        sessionId,
                        peer: {
                            userId: user1.userId,
                            username: user1.username,
                            socketId: user1.socketId,
                        },
                        iceServers: this.getIceServers(),
                    });
                    logger_1.default.info(`Matched users ${user1.userId} and ${user2.userId} in session ${sessionId}`);
                }
                catch (error) {
                    logger_1.default.error('Error matching users:', error);
                    // Return users to waiting queue if match fails
                    this.addToWaitingQueue(user1);
                    this.addToWaitingQueue(user2);
                }
            }
        });
    }
    createChatSession(sessionId, participants) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const chatSession = new ChatSession_1.default({
                    sessionId,
                    participants,
                    startTime: new Date(),
                    isActive: true,
                });
                yield chatSession.save();
                logger_1.default.info(`Created chat session ${sessionId} in database`);
            }
            catch (error) {
                logger_1.default.error(`Error creating chat session ${sessionId}:`, error);
                throw error;
            }
        });
    }
    saveMessage(sessionId, sender, content) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const message = {
                    sender,
                    content,
                    timestamp: new Date(),
                };
                yield ChatSession_1.default.findOneAndUpdate({ sessionId }, { $push: { messages: message } });
                logger_1.default.debug(`Saved message in session ${sessionId}`);
            }
            catch (error) {
                logger_1.default.error(`Error saving message in session ${sessionId}:`, error);
                throw error;
            }
        });
    }
    endSession(sessionId, initiatorId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get participants
                const participants = this.activeConnections.get(sessionId);
                if (!participants) {
                    logger_1.default.warn(`Attempt to end non-existent session ${sessionId}`);
                    return;
                }
                // Notify all participants the session has ended
                participants.forEach((userId) => {
                    // Skip the initiator
                    if (userId !== initiatorId) {
                        const socketId = this.findSocketIdByUserId(userId);
                        if (socketId) {
                            this.io.to(socketId).emit('session:ended', {
                                sessionId,
                                initiator: initiatorId,
                            });
                        }
                        // Remove from user's sessions map
                        this.userSessions.delete(userId);
                    }
                });
                // Remove initiator too
                this.userSessions.delete(initiatorId);
                // Remove from active connections
                this.activeConnections.delete(sessionId);
                // Update database record
                yield ChatSession_1.default.findOneAndUpdate({ sessionId }, {
                    endTime: new Date(),
                    isActive: false,
                });
                logger_1.default.info(`Ended chat session ${sessionId}`);
            }
            catch (error) {
                logger_1.default.error(`Error ending chat session ${sessionId}:`, error);
                throw error;
            }
        });
    }
    getIceServers() {
        const iceServers = [
            {
                urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
            },
        ];
        // Add TURN servers if configured
        if (environment_1.default.TURN_SERVERS && environment_1.default.TURN_USERNAME && environment_1.default.TURN_CREDENTIAL) {
            iceServers.push({
                urls: environment_1.default.TURN_SERVERS.split(','),
                credential: environment_1.default.TURN_CREDENTIAL,
                credentialType: 'password',
                username: environment_1.default.TURN_USERNAME,
            }); // Use type assertion for compatibility
        }
        return { iceServers };
    }
}
exports.default = VideoChatService;
