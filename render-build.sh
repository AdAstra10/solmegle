#!/bin/bash
set -e

echo "==> Starting render-build.sh"

# Clean up any previous builds
echo "==> Cleaning up previous builds"
rm -rf server-static
rm -rf client/build

# Install client dependencies and build
echo "==> Building client"
cd client
npm install --no-optional
npm run build
cd ..

# Create server-static directory
echo "==> Creating static server"
mkdir -p server-static
mkdir -p server-static/public

# Create simple Express server
cat > server-static/server.js << 'EOF'
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;

console.log('Starting Solmegle static server');
console.log('__dirname:', __dirname);
console.log('public path:', path.join(__dirname, 'public'));

// Serve static files with explicit MIME types
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
      console.log('Setting JS MIME type for:', filePath);
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
      console.log('Setting CSS MIME type for:', filePath);
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
  }
}));

// Debug route
app.get('/debug', (req, res) => {
  const fs = require('fs');
  const publicFiles = fs.readdirSync(path.join(__dirname, 'public')).slice(0, 20);
  res.json({
    dirname: __dirname,
    publicPath: path.join(__dirname, 'public'),
    publicExists: fs.existsSync(path.join(__dirname, 'public')),
    publicFiles,
    env: process.env.NODE_ENV
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
EOF

# Create package.json for static server
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
  }
}
EOF

# Copy build to server-static/public
echo "==> Copying client build to static server"
cp -r client/build/* server-static/public/

# Install Express in server-static
echo "==> Installing Express for static server"
cd server-static
npm install --no-package-lock
cd ..

echo "==> Build complete!" 