/**
 * Script to copy React build files to the public directory
 * This is used as a last resort when the build process fails to copy the files
 */

const fs = require('fs');
const path = require('path');

// Log with timestamps
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Determine if we're on Render.com
const isRender = !!process.env.RENDER;

// Set public directory path based on environment
const publicDir = isRender 
  ? '/opt/render/project/src/public'
  : path.join(__dirname, 'public');

// Set client build directory
const clientBuildDir = path.join(__dirname, 'client/build');

log(`Starting copy-react-build script`);
log(`Environment: ${isRender ? 'Render.com' : 'Local'}`);
log(`Public directory: ${publicDir}`);
log(`Client build directory: ${clientBuildDir}`);

// Check if client build directory exists
if (!fs.existsSync(clientBuildDir)) {
  log(`ERROR: Client build directory not found at ${clientBuildDir}`);
  process.exit(1);
}

// Create public directory if it doesn't exist
if (!fs.existsSync(publicDir)) {
  log(`Creating public directory at ${publicDir}`);
  try {
    fs.mkdirSync(publicDir, { recursive: true });
  } catch (error) {
    log(`ERROR: Failed to create public directory: ${error.message}`);
    process.exit(1);
  }
}

// Clean existing files
log(`Cleaning existing files in ${publicDir}`);
try {
  const files = fs.readdirSync(publicDir);
  files.forEach(file => {
    const filePath = path.join(publicDir, file);
    if (fs.lstatSync(filePath).isDirectory()) {
      // Skip videos directory
      if (file !== 'videos') {
        fs.rmSync(filePath, { recursive: true, force: true });
      }
    } else {
      fs.unlinkSync(filePath);
    }
  });
} catch (error) {
  log(`WARNING: Failed to clean public directory: ${error.message}`);
}

// Copy function for directories
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy client build to public directory
log(`Copying client build to ${publicDir}`);
try {
  copyDir(clientBuildDir, publicDir);
  log(`Successfully copied React build files to public directory`);
} catch (error) {
  log(`ERROR: Failed to copy React build files: ${error.message}`);
  process.exit(1);
}

// Verify critical files
const indexPath = path.join(publicDir, 'index.html');
const staticDir = path.join(publicDir, 'static');

if (fs.existsSync(indexPath)) {
  log(`✅ index.html found in ${publicDir}`);
} else {
  log(`❌ ERROR: index.html NOT found in destination!`);
}

if (fs.existsSync(staticDir)) {
  log(`✅ static directory found in ${publicDir}`);
  
  // Check for JS and CSS
  const jsDir = path.join(staticDir, 'js');
  const cssDir = path.join(staticDir, 'css');
  
  if (fs.existsSync(jsDir)) {
    log(`✅ js directory found: ${jsDir}`);
    log(`Contents: ${fs.readdirSync(jsDir).join(', ')}`);
  } else {
    log(`❌ ERROR: js directory NOT found!`);
  }
  
  if (fs.existsSync(cssDir)) {
    log(`✅ css directory found: ${cssDir}`);
    log(`Contents: ${fs.readdirSync(cssDir).join(', ')}`);
  } else {
    log(`❌ ERROR: css directory NOT found!`);
  }
} else {
  log(`❌ ERROR: static directory NOT found in destination!`);
}

log(`React build files copy completed!`); 