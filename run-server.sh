#!/bin/bash

echo "Starting FlexRocket backend server..."

# Create .env file for the server if it doesn't exist
if [ ! -f "./server/.env" ]; then
  echo "Creating .env file for the server..."
  cp ./server/.env.example ./server/.env
fi

# Start the server
cd server
npm run dev 