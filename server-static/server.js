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

// Handle socket connections
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Store the socket ID as a backup userId if none is provided
  socket.userId = socket.id;
  
  // Update waiting count for all connected users
  const emitWaitingCount = () => {
    io.emit('waiting_count', waitingUsers.size);
  };
  
  // Find partner function with priority matching
  socket.on('find_partner', (data) => {
    let userId;
    let priority = 'high'; // Default to high priority to favor real connections
    
    // Handle different formats of data (string or object)
    if (typeof data === 'string') {
      userId = data;
    } else if (typeof data === 'object' && data !== null) {
      userId = data.userId || socket.id;
      priority = data.priority || 'high';
    } else {
      userId = socket.id;
    }
    
    // Always assign the userId to the socket for easier reference
    socket.userId = userId;
    
    console.log(`User ${userId} is looking for a partner (priority: ${priority})`);
    
    // If user is already in an active connection, disconnect them
    if (activeConnections.has(userId)) {
      const partnerId = activeConnections.get(userId);
      const partnerSocket = getSocketByUserId(partnerId);
      
      if (partnerSocket) {
        partnerSocket.emit('partner_disconnected');
      }
      
      activeConnections.delete(userId);
      activeConnections.delete(partnerId);
    }
    
    // Remove from waiting list if already waiting
    waitingUsers.delete(userId);
    
    // Find an available partner with prioritization
    if (waitingUsers.size > 0) {
      // Sort waiting users by time (oldest first) to be fair
      const sortedWaitingUsers = Array.from(waitingUsers.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Get the best match based on waiting time
      const [partnerId, partnerData] = sortedWaitingUsers[0];
      const partnerSocket = partnerData.socket;
      
      console.log(`Matching ${userId} with waiting user ${partnerId} (waited: ${Date.now() - partnerData.timestamp}ms)`);
      
      // Remove partner from waiting list
      waitingUsers.delete(partnerId);
      
      // Create active connection
      activeConnections.set(userId, partnerId);
      activeConnections.set(partnerId, userId);
      
      // Notify both users about the match
      socket.emit('matched', partnerId);
      partnerSocket.emit('matched', userId);
    } else {
      // No partners available, add to waiting list
      waitingUsers.set(userId, {
        socket: socket,
        timestamp: Date.now(),
        priority: priority
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
    } else {
      console.log(`Target user ${data.to} not found for WebRTC answer`);
    }
  });
  
  socket.on('webrtc_ice_candidate', (data) => {
    console.log(`Received ICE candidate from ${data.from} to ${data.to}`);
    
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
      waitingUsers.delete(disconnectedUserId);
    }
    
    // If user was in an active connection, notify partner
    if (activeConnections.has(disconnectedUserId)) {
      const partnerId = activeConnections.get(disconnectedUserId);
      const partnerSocket = getSocketByUserId(partnerId);
      
      if (partnerSocket) {
        partnerSocket.emit('partner_disconnected');
      }
      
      activeConnections.delete(disconnectedUserId);
      activeConnections.delete(partnerId);
    }
    
    // Update waiting count
    emitWaitingCount();
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