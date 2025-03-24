# FlexRocket

A sophisticated and scalable video chat platform similar to Omegle, enabling random pairing for video conversations in real-time.

## Features

- Real-time video chat using WebRTC
- Text messaging alongside video
- Random matching with other users
- High scalability architecture (supporting up to 100K daily users)
- Low-latency communication
- Responsive design for desktop and mobile
- User safety features and content moderation

## Architecture

### Frontend
- React.js with TypeScript
- WebRTC for video streaming
- Socket.io client for real-time communication
- Styled Components for UI

### Backend
- Node.js with Express
- Socket.io for WebSocket connections
- Redis for session management and temporary data
- MongoDB for persistent storage
- Nginx for load balancing
- Docker for containerization

## Technical Implementation

### Scaling Strategy
- Microservices architecture
- Horizontal scaling with container orchestration
- WebRTC for direct peer-to-peer connections to reduce server load
- Redis pub/sub for managing user matching across multiple server instances
- Connection pooling and database sharding for high traffic

### Security Considerations
- STUN/TURN servers for NAT traversal
- End-to-end encryption for video streams
- Rate limiting and request throttling
- Input sanitization
- CORS and CSP implementation

## Development

### Prerequisites
- Node.js (v16+)
- Docker and Docker Compose
- MongoDB
- Redis

### Setup and Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/flex-rocket.git
cd flex-rocket

# Install dependencies
cd client && npm install
cd ../server && npm install

# Start development environment
docker-compose up -d
```

## Deployment
The application is designed to be deployed using Docker containers on a cloud platform like AWS, Google Cloud, or Azure with auto-scaling capabilities.

## License
MIT
