#!/bin/bash
set -e  # Exit immediately if a command exits with a non-zero status

echo "=== RENDER START SCRIPT ==="
echo "Current directory: $(pwd)"
echo "Directory contents:"
ls -la

# Show Render-specific information
echo "=== RENDER ENVIRONMENT ==="
echo "RENDER_SERVICE_ID: $RENDER_SERVICE_ID"
echo "RENDER_EXTERNAL_URL: $RENDER_EXTERNAL_URL"
echo "PORT: $PORT"
echo "NODE_ENV: $NODE_ENV"

# Search for client build files
echo "=== SEARCHING FOR CLIENT BUILD ==="
find /opt/render/project -type d -name build 2>/dev/null | grep -v node_modules || echo "No build directories found"

# Look for the React build files in various locations
CLIENT_BUILD=""
POSSIBLE_LOCATIONS=(
  "./client/build"
  "/opt/render/project/src/client/build"
  "/opt/render/project/cache/client/build"
)

for dir in "${POSSIBLE_LOCATIONS[@]}"; do
  if [ -d "$dir" ] && [ -f "$dir/index.html" ]; then
    echo "✅ Found valid React build at: $dir"
    CLIENT_BUILD="$dir"
    break
  else
    echo "❌ No valid build at: $dir"
  fi
done

# If no build directory is found, we need to build the client
if [ -z "$CLIENT_BUILD" ]; then
  echo "=== NO BUILD FOUND, CREATING CLIENT BUILD ==="
  
  if [ -d "./client" ]; then
    echo "Building client application..."
    cd client
    npm install
    npm run build
    cd ..
    
    if [ -d "./client/build" ]; then
      CLIENT_BUILD="./client/build"
      echo "✅ Successfully built client at $CLIENT_BUILD"
    else
      echo "❌ Failed to build client"
    fi
  else
    echo "❌ Client directory not found"
  fi
fi

# Set public directory
PUBLIC_DIR="/opt/render/project/src/public"
echo "=== PREPARING PUBLIC DIRECTORY ==="
echo "Public directory: $PUBLIC_DIR"

# Create public directory if it doesn't exist
if [ ! -d "$PUBLIC_DIR" ]; then
  echo "Creating public directory..."
  mkdir -p "$PUBLIC_DIR"
fi

# Create videos directory
VIDEOS_DIR="$PUBLIC_DIR/videos"
if [ ! -d "$VIDEOS_DIR" ]; then
  echo "Creating videos directory..."
  mkdir -p "$VIDEOS_DIR"
fi

# If we have a valid client build, copy it to public directory
if [ -n "$CLIENT_BUILD" ]; then
  echo "=== COPYING CLIENT BUILD TO PUBLIC DIRECTORY ==="
  echo "From: $CLIENT_BUILD"
  echo "To: $PUBLIC_DIR"
  
  # Clean existing files except videos
  echo "Cleaning existing files..."
  find "$PUBLIC_DIR" -type f -delete
  find "$PUBLIC_DIR" -type d -not -path "$VIDEOS_DIR" -not -path "$PUBLIC_DIR" -delete
  
  # Copy build files
  echo "Copying files..."
  cp -r "$CLIENT_BUILD"/* "$PUBLIC_DIR/"
  
  # Set proper file permissions and create .htaccess file for MIME types
  echo "Setting correct file permissions..."
  find "$PUBLIC_DIR" -type f -name "*.js" -exec chmod 644 {} \;
  find "$PUBLIC_DIR" -type f -name "*.css" -exec chmod 644 {} \;
  find "$PUBLIC_DIR" -type f -name "*.html" -exec chmod 644 {} \;
  find "$PUBLIC_DIR" -type f -name "*.json" -exec chmod 644 {} \;
  find "$PUBLIC_DIR" -type f -name "*.png" -exec chmod 644 {} \;
  find "$PUBLIC_DIR" -type f -name "*.jpg" -exec chmod 644 {} \;
  find "$PUBLIC_DIR" -type f -name "*.svg" -exec chmod 644 {} \;
  
  # Create a .htaccess file with MIME type definitions (Express will ignore this, but it's good practice)
  echo "Creating .htaccess file with MIME types..."
  cat > "$PUBLIC_DIR/.htaccess" << EOF
# MIME Types
AddType application/javascript .js
AddType text/css .css
AddType application/json .json
AddType image/png .png
AddType image/jpeg .jpg .jpeg
AddType image/svg+xml .svg
AddType video/mp4 .mp4
EOF
  
  # Verify key files
  if [ -f "$PUBLIC_DIR/index.html" ]; then
    echo "✅ index.html copied successfully"
    head -n 10 "$PUBLIC_DIR/index.html"
  else
    echo "❌ Failed to copy index.html"
  fi
  
  if [ -d "$PUBLIC_DIR/static" ]; then
    echo "✅ static directory copied successfully"
    ls -la "$PUBLIC_DIR/static"
    
    # Check JS and CSS files specifically
    if [ -d "$PUBLIC_DIR/static/js" ]; then
      echo "JS files:"
      ls -la "$PUBLIC_DIR/static/js"
      echo "Checking first JS file content type:"
      file $(find "$PUBLIC_DIR/static/js" -name "*.js" | head -1)
    fi
    
    if [ -d "$PUBLIC_DIR/static/css" ]; then
      echo "CSS files:"
      ls -la "$PUBLIC_DIR/static/css"
      echo "Checking first CSS file content type:"
      file $(find "$PUBLIC_DIR/static/css" -name "*.css" | head -1)
    fi
  else
    echo "❌ Failed to copy static directory"
  fi
else
  echo "❌ No valid client build found to copy"
fi

# Start the server
echo "=== STARTING SERVER ==="
node server/dist/index.js 