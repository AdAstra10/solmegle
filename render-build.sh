#!/bin/bash
# Fail on any error
set -e

echo "==> Starting render-build.sh at $(date)"
echo "==> Current directory: $(pwd)"
echo "==> Directory listing:"
ls -la

# Clean up anything in server-static
echo "==> Cleaning up any existing server-static directory"
rm -rf server-static
mkdir -p server-static
mkdir -p server-static/public

# Delete any server directory to prevent Render from using it
echo "==> Ensuring server directory is removed"
rm -rf server

# Install client dependencies and build
echo "==> Building client application"
cd client
echo "==> Client directory: $(pwd)"
npm install --no-optional

echo "==> Running build"
npm run build

echo "==> Client build completed, directory listing:"
ls -la build

# Copy build files to server-static/public
echo "==> Copying build files to server-static/public"
cd ..
cp -r client/build/* server-static/public/

echo "==> Verifying copied files:"
ls -la server-static/public

# Create simple Express server
echo "==> Creating Express server for static files"
cat > server-static/server.js << 'EOF'
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 8080;

console.log('Starting Solmegle static server');
console.log('__dirname:', __dirname);
console.log('public path:', path.join(__dirname, 'public'));
console.log('Files in public directory:');
try {
  const files = fs.readdirSync(path.join(__dirname, 'public'));
  console.log(files);
} catch (err) {
  console.error('Error reading public directory:', err);
}

// Middleware to set MIME types
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  
  if (req.url.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript');
  } else if (req.url.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css');
  } else if (req.url.endsWith('.json')) {
    res.setHeader('Content-Type', 'application/json');
  }
  
  next();
});

// Serve static files with explicit MIME types
app.use(express.static(path.join(__dirname, 'public')));

// Debug route
app.get('/debug', (req, res) => {
  try {
    const publicPath = path.join(__dirname, 'public');
    const publicExists = fs.existsSync(publicPath);
    let publicFiles = [];
    
    if (publicExists) {
      publicFiles = fs.readdirSync(publicPath).slice(0, 50);
    }
    
    res.json({
      timestamp: new Date().toISOString(),
      dirname: __dirname,
      publicPath,
      publicExists,
      publicFiles,
      env: process.env.NODE_ENV,
      port: process.env.PORT || 8080,
      hostname: require('os').hostname()
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// SPA fallback for all other routes
app.get('*', (req, res) => {
  console.log(`Serving index.html for: ${req.url}`);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} at ${new Date().toISOString()}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
EOF

# Create package.json for static server
echo "==> Creating package.json for Express server"
cat > server-static/package.json << 'EOF'
{
  "name": "solmegle-static",
  "version": "1.0.0",
  "main": "server.js",
  "private": true,
  "dependencies": {
    "express": "^4.18.2"
  },
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": "18.x"
  }
}
EOF

# Install Express in server-static
echo "==> Installing Express in server-static"
cd server-static
npm install express --no-package-lock

# Create a verification file for the public directory
echo "==> Creating verification files"
echo "<h1>Solmegle Static Server - Verification Page</h1>" > public/verification.html
echo "console.log('Solmegle verification script loaded');" > public/verification.js
echo "body { background-color: #f0f0f0; }" > public/verification.css

echo "==> Final directory structure:"
cd ..
find server-static -type f | sort

echo "==> Build complete at $(date)!" 