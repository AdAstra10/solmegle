/**
 * Deployment verification script
 * This will run during deploy and verify the environment
 */

const fs = require('fs');
const path = require('path');

console.log('=== VERIFYING DEPLOYMENT CONFIGURATION ===');
console.log(`Current directory: ${process.cwd()}`);
console.log(`Node version: ${process.version}`);
console.log(`Environment: ${process.env.NODE_ENV}`);

// Check if server-static exists
const serverStaticExists = fs.existsSync('server-static');
console.log(`server-static directory exists: ${serverStaticExists}`);

if (serverStaticExists) {
  // Check for necessary files
  const serverJsExists = fs.existsSync('server-static/server.js');
  console.log(`server-static/server.js exists: ${serverJsExists}`);
  
  const publicDirExists = fs.existsSync('server-static/public');
  console.log(`server-static/public directory exists: ${publicDirExists}`);
  
  if (publicDirExists) {
    const publicFiles = fs.readdirSync('server-static/public');
    console.log(`Files in server-static/public (${publicFiles.length} total):`);
    console.log(publicFiles.slice(0, 10).join(', ') + (publicFiles.length > 10 ? '...' : ''));
  }
}

// Check if server directory exists (it shouldn't!)
const oldServerExists = fs.existsSync('server');
console.log(`ALERT: Old server directory exists: ${oldServerExists}`);
if (oldServerExists) {
  console.log('WARNING: The old server directory should be removed to prevent confusion!');
}

// Check if render.yaml exists and print its content
const renderYamlExists = fs.existsSync('render.yaml');
console.log(`render.yaml exists: ${renderYamlExists}`);
if (renderYamlExists) {
  console.log('render.yaml content:');
  console.log(fs.readFileSync('render.yaml', 'utf8'));
}

console.log('=== VERIFICATION COMPLETE ==='); 