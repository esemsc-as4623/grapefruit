#!/bin/bash
# Quick setup script for Grapefruit backend
# Run from project root: ./scripts/setup.sh

set -e

echo "🍊 Grapefruit Setup Script"
echo "=========================="
echo ""

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

# Check for Docker Compose (V2 or V1)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
    echo "✅ Docker Compose V2 found"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    echo "✅ Docker Compose V1 found"
else
    echo "❌ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker found"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    
    # Generate encryption key using openssl (works on macOS/Linux without Node.js)
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    
    # Update .env with generated key
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/your-32-byte-hex-encryption-key-here/$ENCRYPTION_KEY/" .env
    else
        # Linux
        sed -i "s/your-32-byte-hex-encryption-key-here/$ENCRYPTION_KEY/" .env
    fi
    
    echo "✅ .env file created with generated encryption key"
else
    echo "⚠️  .env file already exists, skipping..."
fi

# Install backend dependencies
echo ""
echo "📦 Installing backend dependencies..."
cd backend && npm install && cd ..
echo "✅ Backend dependencies installed"

# Start Docker Compose
echo ""
echo "🐳 Starting Docker containers..."
$DOCKER_COMPOSE up -d

# Wait for database to be ready
echo ""
echo "⏳ Waiting for database to initialize..."
sleep 10

# Check health
echo ""
echo "🏥 Checking service health..."
HEALTH_CHECK=$(curl -s http://localhost:5000/health | grep -o '"status":"ok"' || echo "")

if [ -n "$HEALTH_CHECK" ]; then
    echo "✅ Backend is healthy!"
else
    echo "⚠️  Backend health check failed. Check logs with: $DOCKER_COMPOSE logs backend"
fi

echo ""
echo "=========================="
echo "✅ Setup complete!"
echo ""
echo "Services running:"
echo "  - Database: postgresql://localhost:5432/grapefruit"
echo "  - Backend API: http://localhost:5000"
echo ""
echo "Next steps:"
echo "  1. Test API: curl http://localhost:5000/health"
echo "  2. View inventory: curl http://localhost:5000/inventory"
echo "  3. Run tests: cd backend && npm test"
echo "  4. Trigger simulation: curl -X POST http://localhost:5000/simulate/day"
echo ""
echo "Logs:"
echo "  - View all logs: $DOCKER_COMPOSE logs -f"
echo "  - View backend logs: $DOCKER_COMPOSE logs -f backend"
echo ""
echo "Stop services: $DOCKER_COMPOSE down"
echo "=========================="
