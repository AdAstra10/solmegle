/**
 * Script to verify static files and their MIME types
 * Run this after deployment to check if static files are being served correctly
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Configuration
const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://solmegle.onrender.com';
const publicDir = '/opt/render/project/src/public';
const isRender = !!process.env.RENDER;

// Log with timestamp
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Get content type of a URL
async function getContentType(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      resolve({
        statusCode: res.statusCode,
        contentType: res.headers['content-type'],
        contentLength: res.headers['content-length']
      });
      // Consume response data to free up memory
      res.resume();
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    // Set timeout
    req.setTimeout(5000, () => {
      req.abort();
      reject(new Error('Request timed out'));
    });
  });
}

// Main function
async function verifyStaticFiles() {
  log('Starting static file verification');
  log(`Base URL: ${baseUrl}`);
  
  // Check if we're on Render
  if (!isRender) {
    log('Not running on Render.com, using local file checks only');
  }
  
  // First, check the local file system
  log('\n=== LOCAL FILE CHECKS ===');
  
  // Check if public directory exists
  if (fs.existsSync(publicDir)) {
    log(`✅ Public directory exists: ${publicDir}`);
    
    // Check for index.html
    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      log(`✅ index.html exists (${fs.statSync(indexPath).size} bytes)`);
    } else {
      log('❌ index.html is missing!');
    }
    
    // Check for static directory
    const staticDir = path.join(publicDir, 'static');
    if (fs.existsSync(staticDir)) {
      log(`✅ static directory exists`);
      
      // Check JS files
      const jsDir = path.join(staticDir, 'js');
      if (fs.existsSync(jsDir)) {
        const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
        log(`✅ Found ${jsFiles.length} JS files: ${jsFiles.join(', ')}`);
      } else {
        log('❌ js directory is missing!');
      }
      
      // Check CSS files
      const cssDir = path.join(staticDir, 'css');
      if (fs.existsSync(cssDir)) {
        const cssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
        log(`✅ Found ${cssFiles.length} CSS files: ${cssFiles.join(', ')}`);
      } else {
        log('❌ css directory is missing!');
      }
    } else {
      log('❌ static directory is missing!');
    }
  } else {
    log(`❌ Public directory doesn't exist: ${publicDir}`);
  }
  
  // Now check HTTP endpoints
  log('\n=== HTTP ENDPOINT CHECKS ===');
  
  try {
    // Check the main page
    log(`Checking main page: ${baseUrl}`);
    const indexResult = await getContentType(baseUrl);
    log(`Main page: Status ${indexResult.statusCode}, Content-Type: ${indexResult.contentType}`);
    
    // Check JS file
    const jsUrl = `${baseUrl}/static/js/main.b31c2b4c.js`;
    log(`Checking JS file: ${jsUrl}`);
    const jsResult = await getContentType(jsUrl);
    log(`JS file: Status ${jsResult.statusCode}, Content-Type: ${jsResult.contentType}`);
    
    // Check if Content-Type is correct
    if (jsResult.contentType && jsResult.contentType.includes('application/javascript')) {
      log('✅ JS file has correct MIME type');
    } else {
      log(`❌ JS file has incorrect MIME type: ${jsResult.contentType}`);
    }
    
    // Check CSS file
    const cssUrl = `${baseUrl}/static/css/main.e6c13ad2.css`;
    log(`Checking CSS file: ${cssUrl}`);
    const cssResult = await getContentType(cssUrl);
    log(`CSS file: Status ${cssResult.statusCode}, Content-Type: ${cssResult.contentType}`);
    
    // Check if Content-Type is correct
    if (cssResult.contentType && cssResult.contentType.includes('text/css')) {
      log('✅ CSS file has correct MIME type');
    } else {
      log(`❌ CSS file has incorrect MIME type: ${cssResult.contentType}`);
    }
    
  } catch (error) {
    log(`Error during HTTP checks: ${error.message}`);
  }
  
  log('\nVerification complete');
}

// Run the verification
verifyStaticFiles().catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
}); 