import express from 'express';
import path from 'path';
import fs from 'fs';
import logger from './utils/logger';

/**
 * MIME types map for different file extensions
 */
const MIME_TYPES: { [key: string]: string } = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf'
};

/**
 * Setup static file handling for the Express app
 * @param app Express application
 * @param publicDir Public directory containing static files
 */
export function setupStaticFiles(app: express.Application, publicDir: string): void {
  logger.info(`Setting up static file handling for: ${publicDir}`);
  
  // Log the contents of the static directories to help debugging
  try {
    if (fs.existsSync(path.join(publicDir, 'static'))) {
      const jsDir = path.join(publicDir, 'static/js');
      const cssDir = path.join(publicDir, 'static/css');
      
      if (fs.existsSync(jsDir)) {
        logger.info(`JS files: ${fs.readdirSync(jsDir).join(', ')}`);
      } else {
        logger.warn('JS directory not found!');
      }
      
      if (fs.existsSync(cssDir)) {
        logger.info(`CSS files: ${fs.readdirSync(cssDir).join(', ')}`);
      } else {
        logger.warn('CSS directory not found!');
      }
    } else {
      logger.warn('Static directory not found!');
    }
  } catch (error) {
    logger.error(`Error checking static directories: ${error}`);
  }
  
  // Hardcoded routes for specific problematic files
  setupHardcodedRoutes(app, publicDir);

  // Static file middleware
  app.use((req, res, next) => {
    // Skip API requests and non-GET/HEAD requests
    if (req.path.startsWith('/api') || (req.method !== 'GET' && req.method !== 'HEAD')) {
      return next();
    }
    
    // Extract path
    let filePath = req.path;
    filePath = filePath.split('?')[0].split('#')[0];
    
    // Handle root path
    if (filePath === '/') {
      filePath = '/index.html';
    }
    
    // Build full path
    const fullPath = path.join(publicDir, filePath);
    
    // Check if file exists
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'text/plain';
      
      logger.debug(`Serving ${filePath} as ${contentType}`);
      
      // Set headers
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400'
      });
      
      // Send file
      return res.sendFile(fullPath, (err) => {
        if (err) {
          logger.error(`Error sending file ${filePath}: ${err.message}`);
          next(err);
        }
      });
    }
    
    // Special handling for common static file patterns 
    if (filePath.startsWith('/static/js/') || filePath.startsWith('/static/css/')) {
      logger.warn(`Static file not found: ${filePath}`);
    }
    
    // If not a static file, move on to the next middleware
    return next();
  });
  
  // Special middleware for common static paths
  setupSpecificExtensionHandlers(app, publicDir, '/static/js', '.js', 'application/javascript');
  setupSpecificExtensionHandlers(app, publicDir, '/static/css', '.css', 'text/css');
  
  // Fallback to index.html for SPA routing
  app.use('*', (req, res, next) => {
    // Skip API requests
    if (req.originalUrl.startsWith('/api')) {
      return next();
    }
    
    const indexPath = path.join(publicDir, 'index.html');
    
    if (fs.existsSync(indexPath)) {
      logger.debug(`Serving index.html for: ${req.originalUrl}`);
      res.set('Content-Type', 'text/html');
      return res.sendFile(indexPath);
    }
    
    // If index.html doesn't exist, proceed to 404 handler
    next();
  });
}

/**
 * Setup hardcoded routes for specific problematic files
 */
function setupHardcodedRoutes(app: express.Application, publicDir: string): void {
  // Hardcoded route for main.js
  const mainJsPath = path.join(publicDir, 'static/js/main.b31c2b4c.js');
  if (fs.existsSync(mainJsPath)) {
    logger.info(`Setting up hardcoded route for /static/js/main.b31c2b4c.js`);
    app.get('/static/js/main.b31c2b4c.js', (req, res) => {
      res.set('Content-Type', 'application/javascript');
      res.sendFile(mainJsPath);
    });
  } else {
    logger.warn(`Could not find ${mainJsPath} for hardcoded route`);
  }
  
  // Hardcoded route for main.css
  const mainCssPath = path.join(publicDir, 'static/css/main.e6c13ad2.css');
  if (fs.existsSync(mainCssPath)) {
    logger.info(`Setting up hardcoded route for /static/css/main.e6c13ad2.css`);
    app.get('/static/css/main.e6c13ad2.css', (req, res) => {
      res.set('Content-Type', 'text/css');
      res.sendFile(mainCssPath);
    });
  } else {
    logger.warn(`Could not find ${mainCssPath} for hardcoded route`);
  }
  
  // Hardcoded route for chunk.js
  const chunkJsPath = path.join(publicDir, 'static/js/453.419a5d54.chunk.js');
  if (fs.existsSync(chunkJsPath)) {
    logger.info(`Setting up hardcoded route for /static/js/453.419a5d54.chunk.js`);
    app.get('/static/js/453.419a5d54.chunk.js', (req, res) => {
      res.set('Content-Type', 'application/javascript');
      res.sendFile(chunkJsPath);
    });
  }
  
  // Scan for all React build files and set up explicit routes
  setupReactBuildFiles(app, publicDir);
}

/**
 * Scan for all React build files and set up explicit routes
 */
function setupReactBuildFiles(app: express.Application, publicDir: string): void {
  // Handle asset-manifest.json specially
  const assetManifestPath = path.join(publicDir, 'asset-manifest.json');
  if (fs.existsSync(assetManifestPath)) {
    logger.info('Setting up explicit route for asset-manifest.json');
    app.get('/asset-manifest.json', (req, res) => {
      res.set('Content-Type', 'application/json');
      res.sendFile(assetManifestPath);
    });
    
    // Read the manifest to get a list of all assets
    try {
      const manifestContent = fs.readFileSync(assetManifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);
      
      logger.info(`Asset manifest contains ${Object.keys(manifest.files || {}).length} files`);
      
      // For each file in the manifest, ensure we have a route for it
      if (manifest.files) {
        Object.entries(manifest.files).forEach(([key, filePath]) => {
          if (typeof filePath === 'string' && filePath.startsWith('/')) {
            const fullPath = path.join(publicDir, filePath.substring(1));
            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            
            if (fs.existsSync(fullPath)) {
              logger.info(`Setting up explicit route from manifest: ${filePath} as ${contentType}`);
              app.get(filePath, (req, res) => {
                res.set('Content-Type', contentType);
                res.sendFile(fullPath);
              });
            }
          }
        });
      }
    } catch (error) {
      logger.error(`Error processing asset manifest: ${error}`);
    }
  } else {
    logger.warn('asset-manifest.json not found');
  }
  
  // Scan JS files
  const jsDir = path.join(publicDir, 'static/js');
  if (fs.existsSync(jsDir)) {
    try {
      const jsFiles = fs.readdirSync(jsDir);
      logger.info(`Found ${jsFiles.length} JS files: ${jsFiles.join(', ')}`);
      
      jsFiles.forEach(file => {
        const filePath = path.join(jsDir, file);
        const urlPath = `/static/js/${file}`;
        
        logger.info(`Setting up explicit route for ${urlPath}`);
        app.get(urlPath, (req, res) => {
          res.set('Content-Type', 'application/javascript');
          res.sendFile(filePath);
        });
      });
    } catch (error) {
      logger.error(`Error scanning JS directory: ${error}`);
    }
  }
  
  // Scan CSS files
  const cssDir = path.join(publicDir, 'static/css');
  if (fs.existsSync(cssDir)) {
    try {
      const cssFiles = fs.readdirSync(cssDir);
      logger.info(`Found ${cssFiles.length} CSS files: ${cssFiles.join(', ')}`);
      
      cssFiles.forEach(file => {
        const filePath = path.join(cssDir, file);
        const urlPath = `/static/css/${file}`;
        
        logger.info(`Setting up explicit route for ${urlPath}`);
        app.get(urlPath, (req, res) => {
          res.set('Content-Type', 'text/css');
          res.sendFile(filePath);
        });
      });
    } catch (error) {
      logger.error(`Error scanning CSS directory: ${error}`);
    }
  }
  
  // Handle other static assets in the static directory
  const staticDir = path.join(publicDir, 'static');
  if (fs.existsSync(staticDir)) {
    try {
      // Check for other static asset directories (e.g., media, fonts)
      const staticDirs = fs.readdirSync(staticDir)
        .filter(item => 
          fs.statSync(path.join(staticDir, item)).isDirectory() && 
          !['js', 'css'].includes(item)
        );
      
      staticDirs.forEach(dirName => {
        const assetDir = path.join(staticDir, dirName);
        const files = fs.readdirSync(assetDir);
        
        logger.info(`Found ${files.length} files in static/${dirName}/: ${files.join(', ')}`);
        
        files.forEach(file => {
          const filePath = path.join(assetDir, file);
          const urlPath = `/static/${dirName}/${file}`;
          const ext = path.extname(file).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          
          logger.info(`Setting up explicit route for ${urlPath} as ${contentType}`);
          app.get(urlPath, (req, res) => {
            res.set('Content-Type', contentType);
            res.sendFile(filePath);
          });
        });
      });
    } catch (error) {
      logger.error(`Error scanning static assets: ${error}`);
    }
  }
}

/**
 * Setup handlers for specific file extensions
 */
function setupSpecificExtensionHandlers(
  app: express.Application, 
  publicDir: string, 
  urlPath: string, 
  extension: string, 
  contentType: string
): void {
  const dirPath = path.join(publicDir, urlPath);
  
  if (fs.existsSync(dirPath)) {
    app.use(urlPath, (req, res, next) => {
      const filePath = req.path;
      const fullPath = path.join(dirPath, filePath);
      
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        logger.debug(`Serving ${urlPath}${filePath} with explicit content type: ${contentType}`);
        
        res.set({
          'Content-Type': contentType, 
          'Cache-Control': 'public, max-age=86400'
        });
        
        return res.sendFile(fullPath);
      }
      
      next();
    });
    
    // Special case for these common file paths
    if (extension === '.js') {
      try {
        const files = fs.readdirSync(dirPath);
        const mainJsFile = files.find(file => file.startsWith('main.') && file.endsWith('.js'));
        
        if (mainJsFile) {
          logger.info(`Setting up explicit route for ${mainJsFile}`);
          
          app.get(`/static/js/${mainJsFile}`, (req, res) => {
            res.set('Content-Type', 'application/javascript');
            res.sendFile(path.join(dirPath, mainJsFile));
          });
        }
      } catch (error) {
        logger.error(`Error setting up JS file routes: ${error}`);
      }
    }
    
    if (extension === '.css') {
      try {
        const files = fs.readdirSync(dirPath);
        const mainCssFile = files.find(file => file.startsWith('main.') && file.endsWith('.css'));
        
        if (mainCssFile) {
          logger.info(`Setting up explicit route for ${mainCssFile}`);
          
          app.get(`/static/css/${mainCssFile}`, (req, res) => {
            res.set('Content-Type', 'text/css');
            res.sendFile(path.join(dirPath, mainCssFile));
          });
        }
      } catch (error) {
        logger.error(`Error setting up CSS file routes: ${error}`);
      }
    }
  } else {
    logger.warn(`Directory not found: ${dirPath}`);
  }
} 