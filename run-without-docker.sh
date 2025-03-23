#!/bin/bash

echo "Starting FlexRocket without Docker..."

# Terminal colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create .env file for the server if it doesn't exist
if [ ! -f "./server/.env" ]; then
  echo "Creating .env file for the server..."
  cp ./server/.env.example ./server/.env
fi

# Start the server
echo -e "${YELLOW}Starting the backend server...${NC}"
echo "cd server && npm install && npm run dev"
cd server && npm install

# Start the server in the background
echo -e "${YELLOW}Server is starting at http://localhost:5000${NC}"
npx ts-node-dev --respawn --transpile-only src/index.ts &
SERVER_PID=$!

# Go back to the root directory
cd ..

# Start the client
echo -e "${YELLOW}Starting the frontend client...${NC}"
echo "cd client && npm install && npm start"
cd client && npm install && npm start &
CLIENT_PID=$!

# Function to handle script termination
cleanup() {
  echo -e "${YELLOW}Shutting down services...${NC}"
  kill $SERVER_PID $CLIENT_PID
  exit 0
}

# Register trap for cleanup on exit
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}Application is running!${NC}"
echo -e "Frontend: ${GREEN}http://localhost:3000${NC}"
echo -e "Backend: ${GREEN}http://localhost:5000${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

# Keep the script running
wait $CLIENT_PID 