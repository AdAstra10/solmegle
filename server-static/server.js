const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Use environment variable for port with fallback
const PORT = process.env.PORT || 10000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// For any request that doesn't match a static file, serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// WebSocket implementation for real-time user matching
// Store waiting users and active connections
const waitingUsers = new Map(); // userId -> {socket, timestamp, priority}
const activeConnections = new Map(); // userId -> partnerId
const connectionLog = new Map(); // For debugging connections

// Handle socket connections
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Store the socket ID as a backup userId if none is provided
  socket.userId = socket.id;
  
  // Update waiting count for all connected users
  const emitWaitingCount = () => {
    const count = waitingUsers.size;
    console.log(`Broadcasting waiting count: ${count}`);
    io.emit('waiting_count', count);
  };
  
  // Find partner function with priority matching
  socket.on('find_partner', (data) => {
    let userId;
    
    // Handle different formats of data (string or object)
    if (typeof data === 'string') {
      userId = data;
    } else if (typeof data === 'object' && data !== null) {
      userId = data.userId || socket.id;
    } else {
      userId = socket.id;
    }
    
    // Always assign the userId to the socket for easier reference
    socket.userId = userId;
    
    console.log(`User ${userId} is looking for a partner`);
    
    // If user is already in an active connection, disconnect them first
    // This happens when user clicks "New Chat" button
    if (activeConnections.has(userId)) {
      const partnerId = activeConnections.get(userId);
      const partnerSocket = getSocketByUserId(partnerId);
      
      console.log(`User ${userId} is already connected to ${partnerId} - disconnecting them first`);
      
      if (partnerSocket) {
        partnerSocket.emit('partner_disconnected');
        console.log(`Notified partner ${partnerId} of disconnection`);
      }
      
      // Log the disconnection
      connectionLog.set(`${userId}_${Date.now()}`, {
        event: 'manual_disconnect',
        partnerId: partnerId,
        timestamp: new Date().toISOString()
      });
      
      activeConnections.delete(userId);
      activeConnections.delete(partnerId);
    }
    
    // Remove from waiting list if already waiting
    if (waitingUsers.has(userId)) {
      console.log(`User ${userId} was already in waiting list - removing`);
      waitingUsers.delete(userId);
    }
    
    // Find an available partner with prioritization by waiting time
    if (waitingUsers.size > 0) {
      // Sort waiting users by time (oldest first) to be fair
      const sortedWaitingUsers = Array.from(waitingUsers.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Get the best match based on waiting time
      const [partnerId, partnerData] = sortedWaitingUsers[0];
      const partnerSocket = partnerData.socket;
      
      const waitTime = Date.now() - partnerData.timestamp;
      console.log(`Matching ${userId} with waiting user ${partnerId} (waited: ${waitTime}ms)`);
      
      // Remove partner from waiting list
      waitingUsers.delete(partnerId);
      
      // Create active connection
      activeConnections.set(userId, partnerId);
      activeConnections.set(partnerId, userId);
      
      // Log the connection
      connectionLog.set(`${userId}_${partnerId}_${Date.now()}`, {
        event: 'match_created',
        user1: userId,
        user2: partnerId,
        waitTime: waitTime,
        timestamp: new Date().toISOString()
      });
      
      // Notify both users about the match
      socket.emit('matched', partnerId);
      partnerSocket.emit('matched', userId);
      
      console.log(`Connection established between ${userId} and ${partnerId}`);
      console.log(`Active connections: ${activeConnections.size / 2} pairs`);
    } else {
      // No partners available, add to waiting list
      waitingUsers.set(userId, {
        socket: socket,
        timestamp: Date.now(),
        priority: 'high' // Always use high priority
      });
      console.log(`User ${userId} added to waiting list. Waiting users: ${waitingUsers.size}`);
    }
    
    // Update waiting count for all users
    emitWaitingCount();
  });
  
  // WebRTC signaling handlers
  socket.on('webrtc_offer', (data) => {
    console.log(`Received WebRTC offer from ${data.from} to ${data.to}`);
    
    // Forward the offer to the target user
    const targetSocket = getSocketByUserId(data.to);
    if (targetSocket) {
      targetSocket.emit('webrtc_offer', data);
      console.log(`Forwarded WebRTC offer to ${data.to}`);
    } else {
      console.log(`Target user ${data.to} not found for WebRTC offer`);
    }
  });
  
  socket.on('webrtc_answer', (data) => {
    console.log(`Received WebRTC answer from ${data.from} to ${data.to}`);
    
    // Forward the answer to the target user
    const targetSocket = getSocketByUserId(data.to);
    if (targetSocket) {
      targetSocket.emit('webrtc_answer', data);
      console.log(`Forwarded WebRTC answer to ${data.to}`);
      
      // Log successful connection
      connectionLog.set(`${data.from}_${data.to}_answer_${Date.now()}`, {
        event: 'webrtc_answer_sent',
        from: data.from,
        to: data.to,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`Target user ${data.to} not found for WebRTC answer`);
    }
  });
  
  socket.on('webrtc_ice_candidate', (data) => {
    // Forward ICE candidate to the target user
    const targetSocket = getSocketByUserId(data.to);
    if (targetSocket) {
      targetSocket.emit('webrtc_ice_candidate', data);
    } else {
      console.log(`Target user ${data.to} not found for ICE candidate`);
    }
  });
  
  // Handle messages
  socket.on('send_message', (data) => {
    // Determine the recipient
    const to = data.to;
    const message = data.message;
    
    if (!to || !message) {
      console.log('Invalid message format:', data);
      return;
    }
    
    // Get the partner ID from the active connections
    if (activeConnections.has(to)) {
      const partnerId = activeConnections.get(to);
      const partnerSocket = getSocketByUserId(partnerId);
      
      if (partnerSocket) {
        partnerSocket.emit('user_message', message);
        console.log(`Message forwarded from ${to} to ${partnerId}`);
      } else {
        console.log(`Partner socket not found for ${partnerId}`);
      }
    } else {
      console.log(`No active connection found for ${to}`);
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Use the stored userId
    const disconnectedUserId = socket.userId;
    
    // If user was waiting, remove from waiting list
    if (waitingUsers.has(disconnectedUserId)) {
      console.log(`Removing disconnected user ${disconnectedUserId} from waiting list`);
      waitingUsers.delete(disconnectedUserId);
    }
    
    // If user was in an active connection, notify partner
    if (activeConnections.has(disconnectedUserId)) {
      const partnerId = activeConnections.get(disconnectedUserId);
      const partnerSocket = getSocketByUserId(partnerId);
      
      console.log(`User ${disconnectedUserId} disconnected while connected to ${partnerId}`);
      
      if (partnerSocket) {
        partnerSocket.emit('partner_disconnected');
        console.log(`Notified partner ${partnerId} of disconnection`);
      }
      
      // Log the disconnection
      connectionLog.set(`${disconnectedUserId}_${partnerId}_disconnect_${Date.now()}`, {
        event: 'socket_disconnect',
        user: disconnectedUserId,
        partner: partnerId,
        timestamp: new Date().toISOString()
      });
      
      activeConnections.delete(disconnectedUserId);
      activeConnections.delete(partnerId);
    }
    
    // Update waiting count
    emitWaitingCount();
  });
  
  // Periodically log connection stats
  const statsInterval = setInterval(() => {
    console.log(`===== CONNECTION STATS =====`);
    console.log(`Waiting users: ${waitingUsers.size}`);
    console.log(`Active connections: ${activeConnections.size / 2} pairs`);
    console.log(`Connection log entries: ${connectionLog.size}`);
    console.log(`============================`);
  }, 30000); // Every 30 seconds
  
  socket.on('disconnect', () => {
    clearInterval(statsInterval);
  });
});

// Helper function to get socket by userId
function getSocketByUserId(userId) {
  // First check if the user is in the waiting list
  if (waitingUsers.has(userId)) {
    return waitingUsers.get(userId).socket;
  }
  
  // If not in waiting list, check all connected sockets
  for (const socket of io.sockets.sockets.values()) {
    if (socket.userId === userId) {
      return socket;
    }
  }
  
  return null;
}

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 