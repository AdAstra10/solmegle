import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { redisClient } from '../config/redis';
import logger from '../utils/logger';
import ChatSession from '../models/ChatSession';
import ENV from '../config/environment';

// User queue for random matching
interface QueuedUser {
  userId: string;
  username: string;
  socketId: string;
  joinedAt: Date;
}

class VideoChatService {
  private io: SocketServer;
  private waitingUsers: Map<string, QueuedUser> = new Map();
  private activeConnections: Map<string, Set<string>> = new Map(); // sessionId -> userIds
  private userSessions: Map<string, string> = new Map(); // userId -> sessionId

  constructor(server: HttpServer) {
    this.io = new SocketServer(server, {
      cors: {
        origin: ENV.CORS_ORIGIN,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.setupSocketEvents();
  }

  private setupSocketEvents() {
    this.io.on('connection', (socket) => {
      logger.info(`Socket connected: ${socket.id}`);

      // User joins the waiting queue for random chat
      socket.on('queue:join', async ({ userId, username }) => {
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
        } catch (error) {
          logger.error('Error in queue:join handler:', error);
          socket.emit('error', { message: 'Failed to join queue' });
        }
      });

      // User leaves the waiting queue
      socket.on('queue:leave', ({ userId }) => {
        try {
          this.removeFromWaitingQueue(userId);
          socket.emit('queue:left');
        } catch (error) {
          logger.error('Error in queue:leave handler:', error);
          socket.emit('error', { message: 'Failed to leave queue' });
        }
      });

      // Handle WebRTC signaling
      socket.on('signal', async (data) => {
        try {
          const { sessionId, to, signal } = data;
          
          // Send the signal to the peer
          this.io.to(to).emit('signal', {
            sessionId,
            from: socket.id,
            signal,
          });
        } catch (error) {
          logger.error('Error in signal handler:', error);
          socket.emit('error', { message: 'Failed to send signal' });
        }
      });

      // Handle chat messages
      socket.on('chat:message', async (data) => {
        try {
          const { sessionId, sender, message } = data;
          
          // Save message to database
          await this.saveMessage(sessionId, sender, message);
          
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
        } catch (error) {
          logger.error('Error in chat:message handler:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // End a chat session
      socket.on('session:end', async (data) => {
        try {
          const { sessionId, userId } = data;
          
          if (sessionId) {
            await this.endSession(sessionId, userId);
          }
        } catch (error) {
          logger.error('Error in session:end handler:', error);
          socket.emit('error', { message: 'Failed to end session' });
        }
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        try {
          logger.info(`Socket disconnected: ${socket.id}`);
          
          // Find user by socket id
          const userId = this.findUserIdBySocketId(socket.id);
          
          if (userId) {
            // Remove from waiting queue if present
            this.removeFromWaitingQueue(userId);
            
            // End active session if present
            const sessionId = this.userSessions.get(userId);
            if (sessionId) {
              await this.endSession(sessionId, userId);
            }
          }
        } catch (error) {
          logger.error('Error in disconnect handler:', error);
        }
      });
    });
  }

  private findUserIdBySocketId(socketId: string): string | null {
    for (const [userId, user] of this.waitingUsers.entries()) {
      if (user.socketId === socketId) {
        return userId;
      }
    }
    return null;
  }

  private findSocketIdByUserId(userId: string): string | null {
    const user = this.waitingUsers.get(userId);
    return user ? user.socketId : null;
  }

  private addToWaitingQueue(user: QueuedUser) {
    this.waitingUsers.set(user.userId, user);
    
    // Emit queue status update
    this.io.to(user.socketId).emit('queue:joined', {
      position: this.waitingUsers.size,
      estimatedWaitTime: this.calculateEstimatedWaitTime(),
    });
    
    logger.info(`User ${user.userId} joined waiting queue. Queue size: ${this.waitingUsers.size}`);
  }

  private removeFromWaitingQueue(userId: string) {
    const user = this.waitingUsers.get(userId);
    if (user) {
      this.waitingUsers.delete(userId);
      logger.info(`User ${userId} left waiting queue. Queue size: ${this.waitingUsers.size}`);
    }
  }

  private calculateEstimatedWaitTime(): number {
    // Simple calculation based on queue size
    // In a real implementation, this would be more sophisticated
    const queueSize = this.waitingUsers.size;
    
    // Average wait time in seconds
    return Math.max(5, Math.min(60, queueSize * 5)); 
  }

  private async matchUsers() {
    if (this.waitingUsers.size < 2) return;
    
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
        const sessionId = uuidv4();
        
        // Remove users from waiting queue
        this.removeFromWaitingQueue(user1.userId);
        this.removeFromWaitingQueue(user2.userId);
        
        // Add to active connections
        const participants = new Set<string>();
        participants.add(user1.userId);
        participants.add(user2.userId);
        this.activeConnections.set(sessionId, participants);
        
        // Map users to session
        this.userSessions.set(user1.userId, sessionId);
        this.userSessions.set(user2.userId, sessionId);
        
        // Create a chat session in the database
        await this.createChatSession(sessionId, [user1.userId, user2.userId]);
        
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
        
        logger.info(`Matched users ${user1.userId} and ${user2.userId} in session ${sessionId}`);
      } catch (error) {
        logger.error('Error matching users:', error);
        
        // Return users to waiting queue if match fails
        this.addToWaitingQueue(user1);
        this.addToWaitingQueue(user2);
      }
    }
  }

  private async createChatSession(sessionId: string, participants: string[]) {
    try {
      const chatSession = new ChatSession({
        sessionId,
        participants,
        startTime: new Date(),
        isActive: true,
      });
      
      await chatSession.save();
      logger.info(`Created chat session ${sessionId} in database`);
    } catch (error) {
      logger.error(`Error creating chat session ${sessionId}:`, error);
      throw error;
    }
  }

  private async saveMessage(sessionId: string, sender: string, content: string) {
    try {
      const message = {
        sender,
        content,
        timestamp: new Date(),
      };
      
      await ChatSession.findOneAndUpdate(
        { sessionId },
        { $push: { messages: message } }
      );
      
      logger.debug(`Saved message in session ${sessionId}`);
    } catch (error) {
      logger.error(`Error saving message in session ${sessionId}:`, error);
      throw error;
    }
  }

  private async endSession(sessionId: string, initiatorId: string) {
    try {
      // Get participants
      const participants = this.activeConnections.get(sessionId);
      
      if (!participants) {
        logger.warn(`Attempt to end non-existent session ${sessionId}`);
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
      await ChatSession.findOneAndUpdate(
        { sessionId },
        {
          endTime: new Date(),
          isActive: false,
        }
      );
      
      logger.info(`Ended chat session ${sessionId}`);
    } catch (error) {
      logger.error(`Error ending chat session ${sessionId}:`, error);
      throw error;
    }
  }

  private getIceServers() {
    const iceServers = [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      },
    ];

    // Add TURN servers if configured
    if (ENV.TURN_SERVERS && ENV.TURN_USERNAME && ENV.TURN_CREDENTIAL) {
      iceServers.push({
        urls: ENV.TURN_SERVERS.split(','),
        credential: ENV.TURN_CREDENTIAL,
        credentialType: 'password',
        username: ENV.TURN_USERNAME,
      } as any); // Use type assertion for compatibility
    }
    
    return { iceServers };
  }
}

export default VideoChatService; 