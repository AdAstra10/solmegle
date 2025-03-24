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

// Helper function to get a socket by user ID - simplified for reliability
const getSocketByUserId = (userId) => {
  // Direct socket ID lookup is most reliable
  return io.sockets.sockets.get(userId);
};

// Handle socket connections
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Store the socket ID as userId - using socket.id is more reliable
  socket.userId = socket.id;
  
  // Log active users and connections for debugging
  console.log(`Current active connections: ${activeConnections.size / 2} pairs`);
  console.log(`Current waiting users: ${waitingUsers.size}`);
  
  // CRITICAL FIX: Auto-heartbeat to keep connections alive
  const heartbeatInterval = setInterval(() => {
    socket.emit('heartbeat', { time: Date.now() });
  }, 25000); // Every 25 seconds
  
  // Update waiting count for all connected users
  const emitWaitingCount = () => {
    const count = waitingUsers.size;
    console.log(`Broadcasting waiting count: ${count}`);
    io.emit('waiting_count', count);
  };
  
  // CRITICAL FIX: Simplified find_partner with clearer matching logic
  socket.on('find_partner', (data, callback) => {
    // Always use socket.id as userId for reliability
    const userId = socket.id;
    
    console.log(`User ${userId} is looking for a partner`);
    
    // Send acknowledgment if callback is provided
    if (typeof callback === 'function') {
      try {
        callback({ success: true });
        console.log(`Sent acknowledgment to ${userId} for find_partner request`);
      } catch (err) {
        console.error(`Error sending acknowledgment to ${userId}:`, err);
      }
    }
    
    // If user is already in an active connection, disconnect them first
    if (activeConnections.has(userId)) {
      const partnerId = activeConnections.get(userId);
      const partnerSocket = getSocketByUserId(partnerId);
      
      console.log(`User ${userId} is already connected to ${partnerId} - disconnecting them first`);
      
      if (partnerSocket) {
        partnerSocket.emit('partner_disconnected');
        console.log(`Notified partner ${partnerId} of disconnection`);
      }
      
      // Remove the connection
      activeConnections.delete(userId);
      activeConnections.delete(partnerId);
    }
    
    // Remove from waiting list if already waiting
    waitingUsers.delete(userId);
    
    // Find any available partners (excluding self)
    const availablePartners = Array.from(waitingUsers.entries())
      .filter(([partnerId, _]) => partnerId !== userId)
      .sort((a, b) => a[1].timestamp - b[1].timestamp); // Sort by waiting time
    
    if (availablePartners.length > 0) {
      // Find the first available partner
      const [partnerId, partnerData] = availablePartners[0];
      const partnerSocket = getSocketByUserId(partnerId);
      
      // Check if partner socket is still valid
      if (!partnerSocket) {
        console.log(`Partner socket ${partnerId} is no longer valid - removing from waiting list`);
        waitingUsers.delete(partnerId);
        // Add user to waiting list
        waitingUsers.set(userId, {
          socket: socket,
          timestamp: Date.now()
        });
        console.log(`No valid partners available. User ${userId} added to waiting list.`);
        emitWaitingCount();
        return;
      }
      
      // Remove partner from waiting list
      waitingUsers.delete(partnerId);
      
      // Create active connection
      activeConnections.set(userId, partnerId);
      activeConnections.set(partnerId, userId);
      
      console.log(`Connection established between ${userId} and ${partnerId}`);
      
      // CRITICAL FIX: Send matched events with reliable delivery
      try {
        // Send to current user
        socket.emit('matched', partnerId);
        console.log(`Sent matched event to ${userId} with partner ${partnerId}`);
        
        // Send to partner with small delay to ensure proper sequencing
        setTimeout(() => {
          partnerSocket.emit('matched', userId);
          console.log(`Sent matched event to ${partnerId} with partner ${userId}`);
        }, 300);
      } catch (err) {
        console.error('Error sending matched events:', err);
      }
    } else {
      // No partners available, add to waiting list
      waitingUsers.set(userId, {
        socket: socket,
        timestamp: Date.now()
      });
      console.log(`User ${userId} added to waiting list. Waiting users: ${waitingUsers.size}`);
    }
    
    // Update waiting count for all users
    emitWaitingCount();
  });
  
  // CRITICAL FIX: Simplify WebRTC signaling handlers for more reliability
  socket.on('webrtc_offer', (data) => {
    console.log(`Received WebRTC offer from ${data.from} to ${data.to}`);
    
    // Forward the offer to the target user
    const targetSocket = getSocketByUserId(data.to);
    if (targetSocket) {
      // Simply forward the offer - trust the clients to handle their state
      targetSocket.emit('webrtc_offer', data);
      console.log(`Forwarded WebRTC offer to ${data.to}`);
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
      // console.log(`ICE candidate forwarded from ${data.from} to ${data.to}`); // Log less for cleaner output
    } else {
      console.log(`Target user ${data.to} not found for ICE candidate`);
    }
  });
  
  // CRITICAL FIX: Simplified message handling
  socket.on('send_message', (data) => {
    if (!data.to || !data.message) {
      console.log('Invalid message format:', data);
      return;
    }
    
    const targetSocket = getSocketByUserId(data.to);
    if (targetSocket) {
      targetSocket.emit('user_message', data.message);
      console.log(`Message forwarded from ${socket.id} to ${data.to}`);
    } else {
      console.log(`Target user ${data.to} not found for message`);
      socket.emit('partner_disconnected');
    }
  });
  
  // CRITICAL FIX: Add a keep-alive handler to reset timeouts
  socket.on('heartbeat_response', () => {
    // Reset any connection timeouts
    console.log(`Heartbeat received from ${socket.id}`);
  });
  
  // CRITICAL FIX: Improved disconnection handling - removed duplicate handler
  socket.on('disconnect', () => {
    const userId = socket.id;
    console.log('User disconnected:', userId);
    
    // Clear the heartbeat interval
    clearInterval(heartbeatInterval);
    
    // Remove from waiting list
    waitingUsers.delete(userId);
    
    // Notify partner if in active connection
    if (activeConnections.has(userId)) {
      const partnerId = activeConnections.get(userId);
      const partnerSocket = getSocketByUserId(partnerId);
      
      console.log(`User ${userId} disconnected while connected to ${partnerId}`);
      
      if (partnerSocket) {
        partnerSocket.emit('partner_disconnected');
        console.log(`Notified partner ${partnerId} of disconnection`);
      }
      
      // Remove the connection
      activeConnections.delete(userId);
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
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 