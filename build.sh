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

# Ensure server directory exists
mkdir -p server/public

# Copy client build to server/public
echo "Copying client build to server/public..."
cp -r client/build/* server/public/

# For debugging, list what's in server/public
echo "Contents of server/public:"
ls -la server/public/

# Check if index.html exists
if [ ! -f "server/public/index.html" ]; then
  echo "index.html not found in server/public, creating..."
  # Create a minimal index.html file
  echo '<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Solmegle</title>
  <link rel="stylesheet" href="/static/css/main.e6c13ad2.css" />
</head>
<body>
  <div id="root"></div>
  <script src="/static/js/main.b31c2b4c.js"></script>
</body>
</html>' > server/public/index.html
fi

# Make sure videos directory exists and is populated
mkdir -p server/public/videos

# If client/public/videos has mp4 files, copy them to server/public/videos
if [ -d "client/public/videos" ]; then
  # Copy any MP4 files that exist
  find client/public/videos -name "*.mp4" -exec cp {} server/public/videos/ \; 2>/dev/null || echo "No videos found in client/public/videos"
fi

# Count MP4 files in the videos directory
MP4_COUNT=$(find server/public/videos -name "*.mp4" | wc -l)
echo "Found $MP4_COUNT MP4 files in server/public/videos"

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
  cp temp_videos/*.mp4 server/public/videos/
  
  # Create additional placeholder videos by making copies
  for i in {4..43}; do
    cp "server/public/videos/$(( i % 3 + 1 )).mp4" "server/public/videos/$i.mp4"
  done
  
  # Clean up temporary directory
  rm -rf temp_videos
fi

# Make sure the videos directory is writable
chmod -R 755 server/public/videos

# For debugging purposes
echo "Final contents of server/public/videos:"
ls -la server/public/videos/

# Double-check that index.html exists in the final location
if [ -f "server/public/index.html" ]; then
  echo "index.html is present in server/public/"
else
  echo "WARNING: index.html is still missing from server/public/"
fi 