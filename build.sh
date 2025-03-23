#!/bin/bash

# Install dependencies
npm install

# Skip the reinstall of bcrypt during build (done in postinstall instead)
# We'll focus on videos for now

# Build client and server (if not already done by postinstall)
if [ ! -d "client/build" ]; then
  echo "Building client..."
  cd client && npm run build && cd ..
fi

# Determine the correct public directory based on environment
if [ -n "$RENDER" ]; then
  PUBLIC_DIR="/opt/render/project/src/public"
else
  PUBLIC_DIR="server/public"
fi

# Ensure server directory exists
mkdir -p "$PUBLIC_DIR"

# Copy client build to public directory
echo "Copying client build to $PUBLIC_DIR..."
if [ -d "client/build" ]; then
  cp -r client/build/* "$PUBLIC_DIR/"
  echo "Client build copied successfully."
else
  echo "Warning: client/build directory not found, skipping copy."
fi

# For debugging, list what's in public directory
echo "Contents of $PUBLIC_DIR:"
ls -la "$PUBLIC_DIR"

# Check if index.html exists
if [ ! -f "$PUBLIC_DIR/index.html" ]; then
  echo "index.html not found in $PUBLIC_DIR, creating..."
  # Create a minimal index.html file
  echo '<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Solmegle</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
    h1 { color: #333; }
    p { margin-bottom: 30px; }
  </style>
</head>
<body>
  <h1>Solmegle Video Chat</h1>
  <p>Welcome to Solmegle! The application is running.</p>
  <div id="root"></div>
</body>
</html>' > "$PUBLIC_DIR/index.html"
fi

# Make sure videos directory exists and is populated
mkdir -p "$PUBLIC_DIR/videos"

# If client/public/videos has mp4 files, copy them to public/videos
if [ -d "client/public/videos" ]; then
  # Copy any MP4 files that exist
  find client/public/videos -name "*.mp4" -exec cp {} "$PUBLIC_DIR/videos/" \; 2>/dev/null || echo "No videos found in client/public/videos"
fi

# Count MP4 files in the videos directory
MP4_COUNT=$(find "$PUBLIC_DIR/videos" -name "*.mp4" | wc -l)
echo "Found $MP4_COUNT MP4 files in $PUBLIC_DIR/videos"

# If no MP4 files exist, download some placeholder videos
if [ "$MP4_COUNT" -eq 0 ]; then
  echo "No videos found. Downloading placeholder videos..."
  
  # Create a directory for temporary downloads
  mkdir -p temp_videos
  
  # Download placeholder videos (we'll use a few small videos from pexels.com)
  # These are free stock videos that can be used
  curl -L "https://www.pexels.com/download/video/2759484/?fps=25.0&h=360&w=640" -o temp_videos/1.mp4
  curl -L "https://www.pexels.com/download/video/3045163/?fps=29.97&h=360&w=640" -o temp_videos/2.mp4
  curl -L "https://www.pexels.com/download/video/3194277/?fps=29.97&h=360&w=640" -o temp_videos/3.mp4
  
  # Copy downloaded videos to the server/public/videos directory
  cp temp_videos/*.mp4 "$PUBLIC_DIR/videos/"
  
  # Create additional placeholder videos by making copies
  for i in {4..10}; do
    cp "$PUBLIC_DIR/videos/$(( i % 3 + 1 )).mp4" "$PUBLIC_DIR/videos/$i.mp4"
  done
  
  # Clean up temporary directory
  rm -rf temp_videos
fi

# Make sure the videos directory is writable
chmod -R 755 "$PUBLIC_DIR/videos"

# For debugging purposes
echo "Final contents of $PUBLIC_DIR/videos:"
ls -la "$PUBLIC_DIR/videos/"

# Double-check that index.html exists in the final location
if [ -f "$PUBLIC_DIR/index.html" ]; then
  echo "index.html is present in $PUBLIC_DIR"
  cat "$PUBLIC_DIR/index.html" | head -n 10
else
  echo "WARNING: index.html is still missing from $PUBLIC_DIR"
fi 