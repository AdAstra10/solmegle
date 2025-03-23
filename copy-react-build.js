/**
 * Script to copy React build files to the public directory
 * This is used as a last resort when the build process fails to copy the files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

// Possible locations for client build
const possibleBuildDirs = [
  path.join(__dirname, 'client/build'),                   // Standard path
  '/opt/render/project/src/client/build',                 // Render path
  path.join(__dirname, '../client/build'),                // Relative path if we're in a subdirectory
  path.join(__dirname, 'node_modules/client/build')       // If client was somehow installed as a dependency
];

// Debug system path
log(`Starting copy-react-build script`);
log(`Environment: ${isRender ? 'Render.com' : 'Local'}`);
log(`Current directory: ${__dirname}`);
log(`Public directory: ${publicDir}`);

// Show directory structure for debugging
try {
  const lsOutput = isRender 
    ? execSync('find /opt/render/project -type d -name build | grep -v node_modules').toString()
    : execSync('find . -type d -name build | grep -v node_modules').toString();
  log(`Available build directories:\n${lsOutput}`);
} catch (error) {
  log(`Error listing directories: ${error.message}`);
}

// Find the first valid build directory
let clientBuildDir = null;
for (const dir of possibleBuildDirs) {
  if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'index.html'))) {
    clientBuildDir = dir;
    log(`Found valid React build at: ${dir}`);
    break;
  } else {
    log(`Checked build directory (not valid): ${dir}`);
  }
}

// If we can't find the build directory, let's create it by running the build
if (!clientBuildDir && fs.existsSync(path.join(__dirname, 'client'))) {
  log('No valid build directory found, attempting to build client...');
  try {
    log('Building client application...');
    execSync('cd client && npm install && npm run build', { stdio: 'inherit' });
    clientBuildDir = path.join(__dirname, 'client/build');
    log(`Created build directory at: ${clientBuildDir}`);
  } catch (error) {
    log(`Failed to build client: ${error.message}`);
  }
}

// If we still can't find it, exit
if (!clientBuildDir) {
  log(`ERROR: No valid React build directory found!`);
  
  // Create a basic index.html instead of exiting
  log(`Creating a basic index.html as fallback...`);
  const basicHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Solmegle - Error</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f8f9fa; }
    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #dc3545; }
    p { margin-bottom: 20px; color: #343a40; line-height: 1.5; }
    .error-code { display: inline-block; padding: 8px 16px; background-color: #f8d7da; color: #721c24; border-radius: 4px; font-family: monospace; }
    .help { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 0.9em; color: #6c757d; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Failed to Load Application</h1>
    <p>The Solmegle application couldn't be loaded properly. Our deployment process failed to locate the React build files.</p>
    <div class="error-code">Error: React build files missing</div>
    <p>This is a technical issue with our deployment. The server is running, but the frontend application files could not be found.</p>
    <div class="help">
      <p>Please contact the administrator or try again later. You can also check the application logs for more details about this error.</p>
    </div>
  </div>
</body>
</html>`;

  // Create public directory if it doesn't exist
  if (!fs.existsSync(publicDir)) {
    try {
      fs.mkdirSync(publicDir, { recursive: true });
    } catch (error) {
      log(`ERROR: Failed to create public directory: ${error.message}`);
    }
  }
  
  // Write the basic HTML file
  try {
    fs.writeFileSync(path.join(publicDir, 'index.html'), basicHtml);
    log('Created basic index.html as fallback');
  } catch (error) {
    log(`ERROR: Failed to create fallback index.html: ${error.message}`);
  }
  
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
  
  // Read index.html to check content
  try {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    log(`index.html size: ${indexContent.length} bytes`);
    
    // Check if it has key React elements
    if (indexContent.includes('root')) {
      log('✅ index.html contains "root" div');
    } else {
      log('⚠️ index.html does not contain "root" div!');
    }
    
    if (indexContent.includes('static/js/main') || indexContent.includes('static/css/main')) {
      log('✅ index.html includes references to static assets');
    } else {
      log('⚠️ index.html does not reference static assets!');
    }
  } catch (error) {
    log(`Failed to read index.html: ${error.message}`);
  }
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