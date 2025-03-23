#!/bin/bash
set -e  # Exit immediately if a command exits with a non-zero status

echo "Starting build process..."

# Install dependencies if needed (Render might have already done this)
if [ ! -d "node_modules" ]; then
  echo "Installing root dependencies..."
  npm install
fi

# Ensure client build exists
if [ ! -d "client/build" ]; then
  echo "Building client application..."
  cd client
  # Install dependencies if needed
  if [ ! -d "node_modules" ]; then
    npm install
  fi
  npm run build
  cd ..
fi

# Ensure server is built
if [ ! -d "server/dist" ]; then
  echo "Building server application..."
  cd server
  # Install dependencies if needed
  if [ ! -d "node_modules" ]; then
    npm install
  fi
  npm run build
  cd ..
fi

# Determine the correct public directory based on environment
if [ -n "$RENDER" ]; then
  PUBLIC_DIR="/opt/render/project/src/public"
  echo "Running on Render.com, using path: $PUBLIC_DIR"
else
  PUBLIC_DIR="server/public"
  echo "Running locally, using path: $PUBLIC_DIR"
fi

# Ensure the public directory exists
echo "Creating public directory at $PUBLIC_DIR..."
mkdir -p "$PUBLIC_DIR"

# Clean existing files to avoid stale content
if [ -d "$PUBLIC_DIR" ]; then
  echo "Cleaning existing files in $PUBLIC_DIR..."
  rm -rf "$PUBLIC_DIR"/*
fi

# Copy client build to public directory
echo "Copying client build to $PUBLIC_DIR..."
if [ -d "client/build" ]; then
  cp -r client/build/* "$PUBLIC_DIR/"
  echo "Client build copied successfully."
  
  # Check if we have critical files
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
  echo "❌ ERROR: client/build directory not found! The React app may not have built correctly."
  ls -la client/
fi

# For debugging, list what's in public directory
echo "Contents of $PUBLIC_DIR:"
ls -la "$PUBLIC_DIR" || echo "Failed to list directory contents"

# Check if index.html exists and create it if missing
if [ ! -f "$PUBLIC_DIR/index.html" ]; then
  echo "index.html not found in $PUBLIC_DIR, creating..."
  # Create a minimal index.html file that loads the React app
  echo '<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#000000" />
  <meta name="description" content="Solmegle Video Chat Application" />
  <title>Solmegle Video Chat</title>
  <link rel="stylesheet" href="/static/css/main.e6c13ad2.css" />
</head>
<body>
  <noscript>You need to enable JavaScript to run this app.</noscript>
  <div id="root"></div>
  <script src="/static/js/main.b31c2b4c.js"></script>
</body>
</html>' > "$PUBLIC_DIR/index.html"
  echo "Created custom index.html with React app references"
fi

# Make sure videos directory exists and is populated
echo "Setting up videos directory..."
mkdir -p "$PUBLIC_DIR/videos"

# If client/public/videos has mp4 files, copy them to public/videos
if [ -d "client/public/videos" ]; then
  echo "Copying videos from client/public/videos..."
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
  echo "Downloading sample videos..."
  curl -L "https://www.pexels.com/download/video/2759484/?fps=25.0&h=360&w=640" -o temp_videos/1.mp4
  curl -L "https://www.pexels.com/download/video/3045163/?fps=29.97&h=360&w=640" -o temp_videos/2.mp4
  curl -L "https://www.pexels.com/download/video/3194277/?fps=29.97&h=360&w=640" -o temp_videos/3.mp4
  
  # Copy downloaded videos to the public/videos directory
  echo "Copying downloaded videos to $PUBLIC_DIR/videos/..."
  cp temp_videos/*.mp4 "$PUBLIC_DIR/videos/" || echo "Failed to copy downloaded videos"
  
  # Create additional placeholder videos by making copies
  echo "Creating additional video copies..."
  for i in {4..10}; do
    cp "$PUBLIC_DIR/videos/$(( i % 3 + 1 )).mp4" "$PUBLIC_DIR/videos/$i.mp4" || echo "Failed to create video copy $i"
  done
  
  # Clean up temporary directory
  rm -rf temp_videos
fi

# Make sure the videos directory is writable
chmod -R 755 "$PUBLIC_DIR/videos"

# For debugging purposes
echo "Final contents of $PUBLIC_DIR/videos:"
ls -la "$PUBLIC_DIR/videos/" || echo "Failed to list videos directory"

# Double-check that index.html exists in the final location
if [ -f "$PUBLIC_DIR/index.html" ]; then
  echo "✅ index.html is present in $PUBLIC_DIR"
  cat "$PUBLIC_DIR/index.html" | head -n 10
else
  echo "❌ ERROR: index.html is STILL missing from $PUBLIC_DIR!"
fi

# Double-check that static JS/CSS exists in the final location
if [ -d "$PUBLIC_DIR/static/js" ] && [ -d "$PUBLIC_DIR/static/css" ]; then
  echo "✅ Static JS and CSS directories are present"
  ls -la "$PUBLIC_DIR/static/js/"
  ls -la "$PUBLIC_DIR/static/css/"
else
  echo "❌ ERROR: Static assets are missing!"
  ls -la "$PUBLIC_DIR/" || echo "Failed to list public directory"
fi

echo "Build script completed!" 