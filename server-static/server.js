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
const waitingUsers = new Map(); // userId -> socket
const activeConnections = new Map(); // userId -> partnerId

// Handle socket connections
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Update waiting count for all connected users
  const emitWaitingCount = () => {
    io.emit('waiting_count', waitingUsers.size);
  };
  
  // Find partner function
  socket.on('find_partner', (userId) => {
    console.log(`User ${userId} is looking for a partner`);
    
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
    
    // Find an available partner (anyone else who's waiting)
    if (waitingUsers.size > 0) {
      // Get the first waiting user
      const [partnerId, partnerSocket] = Array.from(waitingUsers.entries())[0];
      
      console.log(`Matching ${userId} with waiting user ${partnerId}`);
      
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
      waitingUsers.set(userId, socket);
      console.log(`User ${userId} added to waiting list. Waiting users: ${waitingUsers.size}`);
    }
    
    // Update waiting count for all users
    emitWaitingCount();
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
    
    // Find user ID from socket
    let disconnectedUserId = null;
    for (const [userId, userSocket] of waitingUsers.entries()) {
      if (userSocket === socket) {
        disconnectedUserId = userId;
        break;
      }
    }
    
    // If user was waiting, remove from waiting list
    if (disconnectedUserId) {
      waitingUsers.delete(disconnectedUserId);
      
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
    }
  });
});

// Helper function to get socket by userId
function getSocketByUserId(userId) {
  if (waitingUsers.has(userId)) {
    return waitingUsers.get(userId);
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