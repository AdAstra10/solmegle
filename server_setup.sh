#!/bin/bash

# Step 3: Set Up Your Server
# Update packages
apt update && apt upgrade -y

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
apt-get install -y nodejs

# Install nginx (web server)
apt install nginx -y

# Install PM2 (process manager for Node.js)
npm install -g pm2

# Create directory for your app
mkdir -p /var/www/myapp
mkdir -p /var/www/myapp/public
mkdir -p /var/www/myapp/server

# Step 5: Configure the Server
# Create nginx config
cat > /etc/nginx/sites-available/myapp << 'EOL'
server {
    listen 80;
    server_name solmegle.com www.solmegle.com;

    # Frontend static files
    location / {
        root /var/www/myapp/public;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /socket.io {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOL

# Enable the site
ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

# Create a basic Node.js server file
cat > /var/www/myapp/server/index.js << 'EOL'
const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../public')));

// API endpoint
app.get('/api/status', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Handle chat messages
  socket.on('chat message', (msg) => {
    io.emit('chat message', msg);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Any request that doesn't match above, send back React's index.html file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
EOL

# Create package.json for server
cat > /var/www/myapp/server/package.json << 'EOL'
{
  "name": "solmegle-server",
  "version": "1.0.0",
  "description": "Solmegle chat server",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.17.1",
    "socket.io": "^4.4.1"
  }
}
EOL

# Step 6: Install dependencies and start the server
cd /var/www/myapp/server
npm install
pm2 start index.js --name "myapp-backend"
pm2 save
pm2 startup

echo "==================================="
echo "Server setup complete!"
echo "Next steps:"
echo "1. Upload your React build files to /var/www/myapp/public"
echo "2. Configure your domain DNS to point to this server"
echo "3. Set up SSL with: certbot --nginx -d yourdomain.com -d www.yourdomain.com"
echo "===================================" 