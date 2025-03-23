# Solmegle - Video Chat Application

Solmegle is a video chat application inspired by Omegle that allows users to connect with random strangers for video conversations.

## Features

- Random video matching with strangers
- Autoplay video functionality
- Seamless transitions between video calls
- Responsive design for desktop and mobile

## Tech Stack

- **Frontend**: React, TypeScript, Styled Components
- **Backend**: Node.js, Express, Socket.IO
- **Database**: MongoDB (for user management)
- **Cache**: Redis (for session management and chat queue)

## Project Structure

```
solmegle/
├── client/           # React frontend
│   ├── public/       # Static assets
│   │   └── videos/   # Video files for simulation
│   └── src/          # Source code
├── server/           # Node.js backend
│   ├── src/          # Source code
│   └── dist/         # Compiled TypeScript
├── package.json      # Root package.json for deployment
└── build.sh          # Build script for deployment
```

## Development

### Prerequisites

- Node.js (v16 or higher)
- MongoDB
- Redis

### Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/solmegle.git
   cd solmegle
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

## Deployment to Render.com

### Step 1: Create a New Web Service

1. Log in to your [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" and select "Web Service"
3. Connect your GitHub repository

### Step 2: Configure the Web Service

- **Name**: Choose a name for your service
- **Environment**: Node
- **Build Command**: `./build.sh`
- **Start Command**: `npm start`
- **Plan**: Choose an appropriate plan (Free tier works for testing)

### Step 3: Add Environment Variables

Create the following environment variables in your Render dashboard:

- `NODE_ENV`: `production`
- `PORT`: `10000` (Render will use its own PORT variable)
- `MONGODB_URI`: Your MongoDB connection string
- `REDIS_URI`: Your Redis connection string (optional)
- `JWT_SECRET`: A secure string for JWT authentication

### Step 4: Deploy

Click "Create Web Service" and Render will automatically build and deploy your application.

## License

This project is licensed under the ISC License.
