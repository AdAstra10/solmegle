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
const connectionAttempts = new Map(); // userId -> {lastAttempt, count} - Tracking connection attempts to prevent spam

// Helper function to get a socket by user ID - simplified for reliability
const getSocketByUserId = (userId) => {
  // Direct socket ID lookup is most reliable
  const socket = io.sockets.sockets.get(userId);
  if (socket) {
    return socket;
  }
  
  // Fallback: look in waiting users map
  const waitingUser = waitingUsers.get(userId);
  if (waitingUser && waitingUser.socket) {
    return waitingUser.socket;
  }
  
  // Last resort: search through all sockets
  for (const [id, socket] of io.sockets.sockets.entries()) {
    if (id === userId || socket.userId === userId) {
      return socket;
    }
  }
  
  console.log(`No socket found for user ID: ${userId}`);
  return null;
};

// CRITICAL FIX: Check for connection lockout to prevent rapid reconnection attempts
const isConnectionLocked = (userId) => {
  const now = Date.now();
  const lastAttempt = connectionAttempts.get(userId);
  
  if (lastAttempt) {
    // If last attempt was less than 1 second ago, enforce lockout (reduced from 3s)
    if (now - lastAttempt.timestamp < 1000) {
      console.log(`Connection attempt from ${userId} locked out - too frequent`);
      return true;
    }
    
    // Update the attempt record
    lastAttempt.timestamp = now;
    lastAttempt.count++;
    connectionAttempts.set(userId, lastAttempt);
  } else {
    // First attempt
    connectionAttempts.set(userId, { timestamp: now, count: 1 });
  }
  
  return false;
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
    
    // CRITICAL FIX: Check for connection lockout to prevent rapid reconnection attempts
    if (isConnectionLocked(userId)) {
      console.log(`User ${userId} is sending find_partner requests too frequently - lockout applied`);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Too many connection attempts. Please wait a moment.' });
      }
      return;
    }
    
    // Send acknowledgment if callback is provided
    if (typeof callback === 'function') {
      try {
        callback({ success: true });
        console.log(`Sent acknowledgment to ${userId} for find_partner request`);
      } catch (err) {
        console.error(`Error sending acknowledgment to ${userId}:`, err);
      }
    }
    
    // CRITICAL FIX: Check if we're already trying to match this user with a partner
    if (activeConnections.has(userId)) {
      const existingPartnerId = activeConnections.get(userId);
      const existingPartnerSocket = getSocketByUserId(existingPartnerId);
      
      if (existingPartnerSocket && existingPartnerSocket.connected) {
        console.log(`User ${userId} already matched with ${existingPartnerId} - not matching again`);
        
        // Inform the client they're already connected
        socket.emit('matched', existingPartnerId);
        console.log(`Re-sent matched event to ${userId} with partner ${existingPartnerId}`);
        
        return;
      } else {
        console.log(`User ${userId} has stale connection to ${existingPartnerId} - removing`);
        activeConnections.delete(userId);
        activeConnections.delete(existingPartnerId);
      }
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
      if (!partnerSocket || !partnerSocket.connected) {
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
      
      // CRITICAL FIX: Check if potential partner is already in an active connection
      if (activeConnections.has(partnerId)) {
        console.log(`Potential partner ${partnerId} is already in an active connection - skipping`);
        // Add user to waiting list
        waitingUsers.set(userId, {
          socket: socket,
          timestamp: Date.now()
        });
        console.log(`User ${userId} added to waiting list. Waiting users: ${waitingUsers.size}`);
        emitWaitingCount();
        return;
      }
      
      // Remove partner from waiting list
      waitingUsers.delete(partnerId);
      
      // Create active connection
      activeConnections.set(userId, partnerId);
      activeConnections.set(partnerId, userId);
      
      console.log(`Connection established between ${userId} and ${partnerId}`);
      
      // Log this connection for debugging
      connectionLog.set(`${userId}-${partnerId}`, {
        timestamp: Date.now(),
        initiator: userId
      });
      
      // CRITICAL FIX: Make sure 'matched' events are delivered reliably
      try {
        // Send to current user
        socket.emit('matched', partnerId);
        console.log(`Sent matched event to ${userId} with partner ${partnerId}`);
        
        // Send to partner
        partnerSocket.emit('matched', userId);
        console.log(`Sent matched event to ${partnerId} with partner ${userId}`);
      } catch (err) {
        console.error('Error sending matched events:', err);
        // Clean up the failed connection
        activeConnections.delete(userId);
        activeConnections.delete(partnerId);
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