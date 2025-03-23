#!/bin/bash
set -e  # Exit immediately if a command exits with a non-zero status

echo "=== RENDER BUILD SCRIPT ==="
echo "Current directory: $(pwd)"
echo "Directory contents:"
ls -la

# Install dependencies
echo "=== INSTALLING DEPENDENCIES ==="
npm install

# Build client
echo "=== BUILDING CLIENT ==="
cd client
npm install
npm run build
cd ..

# Build server
echo "=== BUILDING SERVER ==="
cd server
npm install
npm run build
cd ..

# Setup static file serving
echo "=== SETTING UP STATIC FILES ==="
PUBLIC_DIR="/opt/render/project/src/public"
echo "Using public directory: $PUBLIC_DIR"

# Create public directory
mkdir -p "$PUBLIC_DIR"

# Clean directory if it exists
if [ -d "$PUBLIC_DIR" ]; then
  echo "Cleaning existing files..."
  rm -rf "$PUBLIC_DIR"/*
fi

# Copy client build files to public directory
echo "Copying client build to $PUBLIC_DIR..."
if [ -d "client/build" ]; then
  cp -Rv client/build/* "$PUBLIC_DIR/"
  echo "Client build copied successfully."
  
  # Check for critical files
  if [ -f "$PUBLIC_DIR/index.html" ]; then
    echo "✅ index.html found in $PUBLIC_DIR"
  else
    echo "❌ ERROR: index.html NOT found in destination!"
  fi
  
  if [ -d "$PUBLIC_DIR/static" ]; then
    echo "✅ static directory found in $PUBLIC_DIR"
  else
    echo "❌ ERROR: static directory NOT found in destination!"
  fi
else
  echo "❌ ERROR: client/build directory not found!"
  echo "Contents of client directory:"
  ls -la client/
fi

# Create videos directory
echo "=== SETTING UP VIDEOS DIRECTORY ==="
mkdir -p "$PUBLIC_DIR/videos"

# Copy videos if they exist
if [ -d "client/public/videos" ]; then
  echo "Copying videos from client/public/videos..."
  find client/public/videos -name "*.mp4" -exec cp {} "$PUBLIC_DIR/videos/" \; 2>/dev/null || echo "No videos found in client/public/videos"
fi

# If there are videos in client/build/videos, copy those too
if [ -d "client/build/videos" ]; then
  echo "Copying videos from client/build/videos..."
  find client/build/videos -name "*.mp4" -exec cp {} "$PUBLIC_DIR/videos/" \; 2>/dev/null || echo "No videos found in client/build/videos"
fi

# Count MP4 files
MP4_COUNT=$(find "$PUBLIC_DIR/videos" -name "*.mp4" | wc -l)
echo "Found $MP4_COUNT MP4 files in $PUBLIC_DIR/videos"

# Make videos directory writable
chmod -R 755 "$PUBLIC_DIR/videos"

# Final check
echo "=== FINAL CHECK ==="
echo "Public directory contents:"
ls -la "$PUBLIC_DIR"

if [ -d "$PUBLIC_DIR/static" ]; then
  echo "Static directory contents:"
  ls -la "$PUBLIC_DIR/static"
else
  echo "❌ Static directory missing!"
fi

echo "=== BUILD COMPLETED ===" 