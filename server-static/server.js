const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

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
  
  // Update waiting count for all connected users
  const emitWaitingCount = () => {
    io.emit('waiting_count', waitingUsers.size);
  };
  
  // Find partner function with priority matching
  socket.on('find_partner', (data) => {
    // Handle both old and new format
    const userId = typeof data === 'object' ? data.userId : data;
    const priority = (typeof data === 'object' && data.priority) ? data.priority : 'normal';
    
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
    
    // Store socket reference with the user ID for easier lookup
    socket.userId = userId;
    
    // Find an available partner with prioritization
    if (waitingUsers.size > 0) {
      // Sort waiting users by priority (high first) and then by time (oldest first)
      const sortedWaitingUsers = Array.from(waitingUsers.entries())
        .sort((a, b) => {
          // First compare by priority
          if (a[1].priority === 'high' && b[1].priority !== 'high') return -1;
          if (a[1].priority !== 'high' && b[1].priority === 'high') return 1;
          
          // Then compare by timestamp (oldest first)
          return a[1].timestamp - b[1].timestamp;
        });
      
      // Get the best match based on priority
      const [partnerId, partnerData] = sortedWaitingUsers[0];
      const partnerSocket = partnerData.socket;
      
      console.log(`Matching ${userId} with waiting user ${partnerId} (priority: ${partnerData.priority})`);
      
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
  
  // Handle video stream requests
  socket.on('request_video_stream', (partnerId) => {
    if (activeConnections.has(partnerId)) {
      const requestingUserId = socket.userId;
      const partnerSocket = getSocketByUserId(partnerId);
      
      if (partnerSocket) {
        // Request partner to send their video stream
        partnerSocket.emit('send_video_stream', requestingUserId);
      }
    }
  });
  
  // Forward video stream data to partner
  socket.on('video_stream_data', ({ to, streamData }) => {
    if (activeConnections.has(to)) {
      const partnerSocket = getSocketByUserId(to);
      
      if (partnerSocket) {
        partnerSocket.emit('video_stream', streamData);
      }
    }
  });
  
  // Handle messages
  socket.on('send_message', ({ to, message }) => {
    if (activeConnections.has(to)) {
      const partnerId = activeConnections.get(to);
      const partnerSocket = getSocketByUserId(partnerId);
      
      if (partnerSocket) {
        partnerSocket.emit('user_message', message);
      }
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
  if (waitingUsers.has(userId)) {
    return waitingUsers.get(userId).socket;
  }
  
  // If not in waiting list, check all sockets
  for (const socket of io.sockets.sockets.values()) {
    if (socket.userId === userId) {
      return socket;
    }
  }
  
  return null;
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 