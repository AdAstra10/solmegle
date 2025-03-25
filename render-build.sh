#!/bin/bash

# Build script for Render.com deployment

# Exit on error
set -e

# Build the client
echo "Building the client..."
cd client
npm install
npm run build
cd ..

# Create server-static directory if it doesn't exist
mkdir -p server-static

# Copy static files
echo "Copying static files..."
cp -r client/build/* server-static/

# Set up a simple Node.js server to serve the static files with WebSocket support
echo "Setting up static server..."
cd server-static
cat > server.js << 'EOF'
const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

// Create express app and server
const app = express();
const server = http.createServer(app);

// Configure Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000, // Increased timeout for more stable connections
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Add specific static file handling with proper content type
app.get('/static/static.mp4', (req, res) => {
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  res.sendFile(path.join(__dirname, 'static', 'static.mp4'));
});

// For any request that doesn't match a static file, serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// WebSocket implementation for real-time user matching
// Store waiting users and active connections
const waitingUsers = new Map(); // userId -> {socket, timestamp}
const activeConnections = new Map(); // userId -> partnerId
const connectionLog = new Map(); // For debugging connections
const connectionAttempts = new Map(); // userId -> {lastAttempt, count}

// Helper function to get a socket by user ID
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

// Rate limiting for connection attempts
const isConnectionLocked = (userId) => {
  const now = Date.now();
  const lastAttempt = connectionAttempts.get(userId);
  
  if (lastAttempt) {
    // Lock if last attempt was within 1 second
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
  
  // Set socket ID as userId for reliable reference
  socket.userId = socket.id;
  
  // Log active users and connections for debugging
  console.log(`Current active connections: ${activeConnections.size / 2} pairs`);
  console.log(`Current waiting users: ${waitingUsers.size}`);
  
  // Auto-heartbeat to keep connections alive
  const heartbeatInterval = setInterval(() => {
    socket.emit('heartbeat', { time: Date.now() });
  }, 25000); // Every 25 seconds
  
  // Update waiting count for all connected users
  const emitWaitingCount = () => {
    const count = waitingUsers.size;
    io.emit('waiting_count', count);
  };
  
  // Find partner handler
  socket.on('find_partner', (data, callback) => {
    const userId = socket.id;
    console.log(`User ${userId} is looking for a partner`);
    
    // Rate limit connection requests
    if (isConnectionLocked(userId)) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Too many connection attempts. Please wait a moment.' });
      }
      return;
    }
    
    // Send acknowledgment if callback provided
    if (typeof callback === 'function') {
      callback({ success: true });
    }
    
    // Check if already connected to a partner
    if (activeConnections.has(userId)) {
      const existingPartnerId = activeConnections.get(userId);
      const existingPartnerSocket = getSocketByUserId(existingPartnerId);
      
      if (existingPartnerSocket && existingPartnerSocket.connected) {
        console.log(`User ${userId} already matched with ${existingPartnerId}`);
        socket.emit('matched', existingPartnerId);
        return;
      } else {
        // Remove stale connection
        activeConnections.delete(userId);
        activeConnections.delete(existingPartnerId);
      }
    }
    
    // Remove from waiting list if already waiting
    waitingUsers.delete(userId);
    
    // Find available partners
    const availablePartners = Array.from(waitingUsers.entries())
      .filter(([partnerId, _]) => partnerId !== userId)
      .sort((a, b) => a[1].timestamp - b[1].timestamp); // Sort by waiting time
    
    if (availablePartners.length > 0) {
      // Get the first available partner
      const [partnerId, partnerData] = availablePartners[0];
      const partnerSocket = getSocketByUserId(partnerId);
      
      // Validate partner socket
      if (!partnerSocket || !partnerSocket.connected) {
        console.log(`Partner socket ${partnerId} is no longer valid - removing from waiting list`);
        waitingUsers.delete(partnerId);
        
        // Add user to waiting list
        waitingUsers.set(userId, {
          socket: socket,
          timestamp: Date.now()
        });
        
        emitWaitingCount();
        return;
      }
      
      // Check if potential partner is already connected
      if (activeConnections.has(partnerId)) {
        console.log(`Potential partner ${partnerId} is already in an active connection`);
        
        // Add user to waiting list
        waitingUsers.set(userId, {
          socket: socket,
          timestamp: Date.now()
        });
        
        emitWaitingCount();
        return;
      }
      
      // Remove partner from waiting list
      waitingUsers.delete(partnerId);
      
      // Create active connection
      activeConnections.set(userId, partnerId);
      activeConnections.set(partnerId, userId);
      
      console.log(`Connection established between ${userId} and ${partnerId}`);
      
      // Log this connection
      connectionLog.set(`${userId}-${partnerId}`, {
        timestamp: Date.now(),
        initiator: userId
      });
      
      // Notify both users
      try {
        socket.emit('matched', partnerId);
        partnerSocket.emit('matched', userId);
      } catch (err) {
        console.error('Error sending matched events:', err);
        activeConnections.delete(userId);
        activeConnections.delete(partnerId);
      }
    } else {
      // No partners available, add to waiting list
      waitingUsers.set(userId, {
        socket: socket,
        timestamp: Date.now()
      });
      console.log(`User ${userId} added to waiting list. Users waiting: ${waitingUsers.size}`);
    }
    
    // Broadcast waiting count
    emitWaitingCount();
  });
  
  // Handle start_new_chat event from a user
  socket.on('start_new_chat', (data) => {
    console.log(`User ${socket.id} wants to start a new chat, notifying partner`);
    
    if (!data || !data.partnerId) {
      console.log(`Invalid start_new_chat data from ${socket.id}:`, data);
      return;
    }
    
    const partnerId = data.partnerId;
    const partnerSocket = getSocketByUserId(partnerId);
    
    if (partnerSocket) {
      console.log(`Notifying partner ${partnerId} that the chat has been reset`);
      // Send the partner_start_new event to the partner
      partnerSocket.emit('partner_start_new');
      
      // Remove their active connection if it exists
      cleanupConnection(socket.id, partnerId);
    } else {
      console.log(`Partner socket ${partnerId} not found for new chat notification`);
    }
    
    // Remove from waiting and active connections
    waitingUsers.delete(socket.id);
    cleanupUserConnections(socket.id);
  });
  
  // WebRTC signaling handlers
  socket.on('webrtc_offer', (data) => {
    if (!data || !data.to) {
      console.log('Invalid offer data received');
      return;
    }
    
    console.log(`Received WebRTC offer from ${data.from || socket.id} to ${data.to}`);
    
    // Forward the offer to the target user
    const targetSocket = getSocketByUserId(data.to);
    if (targetSocket && targetSocket.connected) {
      // Make sure from is set correctly
      if (!data.from) {
        data.from = socket.id;
      }
      
      targetSocket.emit('webrtc_offer', data);
      console.log(`Forwarded WebRTC offer to ${data.to}`);
    } else {
      console.log(`Target user ${data.to} not found for WebRTC offer`);
      socket.emit('partner_disconnected');
    }
  });
  
  socket.on('webrtc_answer', (data) => {
    if (!data || !data.to) {
      console.log('Invalid answer data received');
      return;
    }
    
    console.log(`Received WebRTC answer from ${data.from || socket.id} to ${data.to}`);
    
    // Forward the answer to the target user
    const targetSocket = getSocketByUserId(data.to);
    if (targetSocket && targetSocket.connected) {
      // Make sure from is set correctly
      if (!data.from) {
        data.from = socket.id;
      }
      
      targetSocket.emit('webrtc_answer', data);
      console.log(`Forwarded WebRTC answer to ${data.to}`);
    } else {
      console.log(`Target user ${data.to} not found for WebRTC answer`);
      socket.emit('partner_disconnected');
    }
  });
  
  socket.on('webrtc_ice_candidate', (data) => {
    if (!data || !data.to) {
      console.log('Invalid ICE candidate data received');
      return;
    }
    
    // Forward the ICE candidate to the target user
    const targetSocket = getSocketByUserId(data.to);
    if (targetSocket && targetSocket.connected) {
      // Make sure from is set correctly
      if (!data.from) {
        data.from = socket.id;
      }
      
      targetSocket.emit('webrtc_ice_candidate', data);
      // console.log(`Forwarded ICE candidate from ${data.from} to ${data.to}`);
    } else {
      console.log(`Target user ${data.to} not found for ICE candidate`);
    }
  });
  
  // Message handling
  socket.on('send_message', (data) => {
    if (!data || !data.to || !data.message) {
      console.log('Invalid message format:', data);
      return;
    }
    
    // Forward the message to the target user
    const targetSocket = getSocketByUserId(data.to);
    if (targetSocket && targetSocket.connected) {
      targetSocket.emit('user_message', data.message);
      console.log(`Message forwarded from ${socket.id} to ${data.to}`);
    } else {
      console.log(`Target user ${data.to} not found for message`);
      socket.emit('partner_disconnected');
    }
  });
  
  // Heartbeat response handler
  socket.on('heartbeat_response', () => {
    // Reset any connection timeouts
    console.log(`Heartbeat received from ${socket.id}`);
  });
  
  // Disconnection handler
  socket.on('disconnect', () => {
    const userId = socket.id;
    console.log('User disconnected:', userId);
    
    // Clean up intervals
    clearInterval(heartbeatInterval);
    
    // Remove from waiting list
    waitingUsers.delete(userId);
    
    // Handle active connections
    if (activeConnections.has(userId)) {
      const partnerId = activeConnections.get(userId);
      const partnerSocket = getSocketByUserId(partnerId);
      
      console.log(`User ${userId} disconnected while connected to ${partnerId}`);
      
      if (partnerSocket && partnerSocket.connected) {
        partnerSocket.emit('partner_disconnected');
        console.log(`Notified partner ${partnerId} of disconnection`);
      }
      
      // Remove connection
      activeConnections.delete(userId);
      activeConnections.delete(partnerId);
    }
    
    // Update waiting count
    emitWaitingCount();
  });
});

// Periodically log connection stats
setInterval(() => {
  console.log(`===== CONNECTION STATS =====`);
  console.log(`Waiting users: ${waitingUsers.size}`);
  console.log(`Active connections: ${activeConnections.size / 2} pairs`);
  console.log(`============================`);
}, 30000);

// Update the connection handling to be more reliable (after the WebSocket implementation section)
// Helper function to clean up connections properly
const cleanupConnection = (userId, partnerId) => {
  console.log(`Cleaning up connection between ${userId} and ${partnerId}`);
  
  // Remove from active connections
  activeConnections.delete(userId);
  activeConnections.delete(partnerId);
  
  // Make sure both users are properly notified if needed
  const userSocket = getSocketByUserId(userId);
  const partnerSocket = getSocketByUserId(partnerId);
  
  // Ensure connections are reset on both sides
  if (userSocket && userSocket.connected) {
    // No need to notify the user who initiated the cleanup
  }
  
  if (partnerSocket && partnerSocket.connected) {
    // Already notified through partner_start_new
  }
};

// Helper to clean up all connections for a user
const cleanupUserConnections = (userId) => {
  if (activeConnections.has(userId)) {
    const partnerId = activeConnections.get(userId);
    cleanupConnection(userId, partnerId);
  }
  
  // Also remove from waiting users
  waitingUsers.delete(userId);
};

// Make sure server has proper error handling (at the end before server.listen)
// Add error handling for the server
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Add graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
EOF

# Initialize a new Node.js project and install dependencies
npm init -y
npm install express socket.io

echo "Build completed successfully!" 