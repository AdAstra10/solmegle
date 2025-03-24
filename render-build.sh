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

# Set up a simple Node.js server to serve the static files
echo "Setting up static server..."
cd server-static
cat > server.js << 'EOF'
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// For any request that doesn't match a static file, serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
EOF

# Install Express for the static server
npm init -y
npm install express

echo "Build completed successfully!" 