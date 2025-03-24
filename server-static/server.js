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

// Helper function to get a socket by user ID
const getSocketByUserId = (userId) => {
  // First check if it's a direct socket ID match
  const socket = io.sockets.sockets.get(userId);
  if (socket) {
    return socket;
  }
  
  // Otherwise, search through waiting users
  for (const [id, data] of waitingUsers.entries()) {
    if (id === userId) {
      return data.socket;
    }
  }
  
  // If not found, search through all connected sockets
  for (const socket of io.sockets.sockets.values()) {
    if (socket.userId === userId) {
      return socket;
    }
  }
  
  console.log(`Socket not found for userId: ${userId}`);
  return null;
};

// Handle socket connections
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Store the socket ID as the userId
  socket.userId = socket.id;
  
  // Update waiting count for all connected users
  const emitWaitingCount = () => {
    const count = waitingUsers.size;
    console.log(`Broadcasting waiting count: ${count}`);
    io.emit('waiting_count', count);
  };
  
  // Log active users and connections for debugging
  console.log(`Current active connections: ${activeConnections.size / 2} pairs`);
  console.log(`Current waiting users: ${waitingUsers.size}`);
  console.log(`Active waiting users: ${Array.from(waitingUsers.keys()).join(', ')}`);
  
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
    // IMPORTANT: Prioritize finding a match instead of immediately adding to waiting list
    const availablePartners = Array.from(waitingUsers.entries())
      .filter(([partnerId, _]) => partnerId !== userId) // Don't match with self
      .sort((a, b) => a[1].timestamp - b[1].timestamp); // Sort by waiting time (oldest first)
    
    if (availablePartners.length > 0) {
      // Find the first available partner
      const [partnerId, partnerData] = availablePartners[0];
      const partnerSocket = partnerData.socket;
      
      const waitTime = Date.now() - partnerData.timestamp;
      console.log(`Matching ${userId} with waiting user ${partnerId} (waited: ${waitTime}ms)`);
      
      // Check if partner socket is still valid and connected
      if (!partnerSocket || !partnerSocket.connected) {
        console.log(`Partner socket ${partnerId} is no longer valid or connected - removing from waiting list and trying again`);
        waitingUsers.delete(partnerId);
        
        // Try again with another user by recalling this function
        process.nextTick(() => socket.emit('find_partner', userId));
        return;
      }
      
      // CRITICAL: Remove partner from waiting list BEFORE sending match notifications
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
      
      // Double check that neither user is still in waiting list (just to be safe)
      waitingUsers.delete(userId);
      waitingUsers.delete(partnerId);
      
      // IMPORTANT: Make sure both users are properly notified
      console.log(`Sending matched events to ${userId} and ${partnerId}`);
      
      // Send match notifications with a slight delay between them
      socket.emit('matched', partnerId);
      setTimeout(() => {
        if (partnerSocket && partnerSocket.connected) {
          partnerSocket.emit('matched', userId);
          console.log(`Match notification sent to both users`);
        } else {
          console.log(`Partner socket disconnected before match notification, cleaning up`);
          activeConnections.delete(userId);
          activeConnections.delete(partnerId);
          socket.emit('partner_disconnected');
        }
      }, 100);
      
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
      // Verify the connection is active or create one
      if (activeConnections.has(data.from) && activeConnections.get(data.from) === data.to) {
        console.log(`Forwarding WebRTC offer to established partner ${data.to}`);
        targetSocket.emit('webrtc_offer', data);
      } else {
        console.log(`Connection between ${data.from} and ${data.to} is not active - creating connection first`);
        // Create the connection before forwarding the offer
        activeConnections.set(data.from, data.to);
        activeConnections.set(data.to, data.from);
        
        // Make sure neither user is in waiting list
        waitingUsers.delete(data.from);
        waitingUsers.delete(data.to);
        
        // First notify both users about the match
        socket.emit('matched', data.to);
        targetSocket.emit('matched', data.from);
        
        // Wait for a moment before forwarding the offer to ensure clients are ready
        setTimeout(() => {
          if (targetSocket.connected) {
            targetSocket.emit('webrtc_offer', data);
            console.log(`Forwarded WebRTC offer after connection creation`);
          }
        }, 500);
      }
    } else {
      console.log(`Target user ${data.to} not found for WebRTC offer`);
      // Notify sender that target is not available
      socket.emit('partner_disconnected');
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
      // Notify sender that target is not available
      socket.emit('partner_disconnected');
    }
  });
  
  socket.on('webrtc_ice_candidate', (data) => {
    // Forward ICE candidate to the target user
    const targetSocket = getSocketByUserId(data.to);
    if (targetSocket) {
      targetSocket.emit('webrtc_ice_candidate', data);
      console.log(`ICE candidate forwarded from ${data.from} to ${data.to}`);
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
    
    console.log(`Message from ${socket.userId} to ${to}: ${message.substring(0, 20)}...`);
    
    // Get the partner ID from the active connections
    if (activeConnections.has(to)) {
      const partnerId = activeConnections.get(to);
      const partnerSocket = getSocketByUserId(partnerId);
      
      if (partnerSocket) {
        partnerSocket.emit('user_message', message);
        console.log(`Message forwarded from ${to} to ${partnerId}`);
      } else {
        console.log(`Partner socket not found for ${partnerId}`);
        socket.emit('partner_disconnected');
      }
    } else {
      console.log(`No active connection found for ${to}`);
      socket.emit('partner_disconnected');
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

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 