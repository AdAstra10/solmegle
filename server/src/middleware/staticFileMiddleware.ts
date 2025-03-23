import express from 'express';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';

/**
 * Custom middleware to serve static files with correct MIME types
 * This is a fallback approach when Express's built-in static middleware isn't working correctly
 */
export function serveStaticFile(publicDir: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Only handle GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    // Extract the file path from the URL
    let filePath = req.path;
    
    // Remove query string
    filePath = filePath.split('?')[0];
    
    // Remove hash
    filePath = filePath.split('#')[0];
    
    // Handle root path
    if (filePath === '/') {
      filePath = '/index.html';
    }

    // Convert URL path to file system path
    const fullPath = path.join(publicDir, filePath);

    // Check if the file exists
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return next();
    }

    // Set MIME type based on file extension
    const ext = path.extname(fullPath).toLowerCase();
    let contentType = 'text/html';

    switch (ext) {
      case '.js':
        contentType = 'application/javascript';
        break;
      case '.css':
        contentType = 'text/css';
        break;
      case '.json':
        contentType = 'application/json';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
      case '.mp4':
        contentType = 'video/mp4';
        break;
      case '.woff':
        contentType = 'application/font-woff';
        break;
      case '.woff2':
        contentType = 'application/font-woff2';
        break;
      case '.ttf':
        contentType = 'application/font-ttf';
        break;
      case '.eot':
        contentType = 'application/vnd.ms-fontobject';
        break;
      case '.otf':
        contentType = 'application/font-otf';
        break;
      case '.ico':
        contentType = 'image/x-icon';
        break;
    }

    // Log the file being served for debugging
    logger.debug(`Serving ${filePath} as ${contentType}`);

    // Set content type and send file
    res.setHeader('Content-Type', contentType);
    
    // Set caching headers for better performance
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    
    // Send the file
    res.sendFile(fullPath, (err) => {
      if (err) {
        logger.error(`Error sending file ${filePath}: ${err.message}`);
        next(err);
      }
    });
  };
}

/**
 * Middleware to ensure index.html is served for paths that don't match files
 */
export function serveIndexForRoutes(publicDir: string) {
  return (req: express.Request, res: express.Response) => {
    const indexPath = path.join(publicDir, 'index.html');
    
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html');
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Index file not found');
    }
  };
} 