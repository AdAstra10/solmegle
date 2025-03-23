#!/bin/bash

echo "Starting FlexRocket video chat application..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running or not installed. Please start Docker first."
  exit 1
fi

# Stop and remove any existing containers
echo "Cleaning up any existing containers..."
docker-compose down

# Build and start the containers
echo "Building and starting containers..."
docker-compose up -d

echo "Application is starting up..."
echo "You can access the application at: http://localhost:3000"
echo "It might take a few moments for all services to be ready."
echo ""
echo "To stop the application, run: docker-compose down" 