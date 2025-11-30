#!/bin/bash
# Frontend startup and verification script
# Run from project root: ./scripts/start-frontend.sh

set -e

echo "🍊 Grapefruit Frontend Startup"
echo "=============================="
echo ""

# Check for Docker (handle macOS Docker Desktop installation)
if command -v docker &> /dev/null; then
    DOCKER_CMD="docker"
elif [ -f "/Applications/Docker.app/Contents/Resources/bin/docker" ]; then
    DOCKER_CMD="/Applications/Docker.app/Contents/Resources/bin/docker"
    echo "ℹ️  Using Docker from Docker Desktop application"
else
    echo "❌ Docker not found. Please install Docker Desktop first."
    echo "   Download from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check for Docker Compose (V2 or V1)
if $DOCKER_CMD compose version &> /dev/null; then
    DOCKER_COMPOSE="$DOCKER_CMD compose"
    echo "✅ Docker Compose V2 found"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    echo "✅ Docker Compose V1 found"
else
    echo "❌ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker found"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "1️⃣  Checking backend services..."
if ! $DOCKER_COMPOSE ps | grep -q "grapefruit-backend.*Up"; then
    echo -e "${YELLOW}Backend not running. Starting backend services...${NC}"
    $DOCKER_COMPOSE up -d postgres backend
    echo "⏳ Waiting for backend to be ready..."
    sleep 10
fi

# Check backend health
BACKEND_HEALTH=$(curl -s http://localhost:5000/health 2>/dev/null || echo "")
if [ -z "$BACKEND_HEALTH" ]; then
    echo -e "${YELLOW}⚠️  Backend not responding. Waiting 10 more seconds...${NC}"
    sleep 10
    BACKEND_HEALTH=$(curl -s http://localhost:5000/health 2>/dev/null || echo "")
fi

if [ -n "$BACKEND_HEALTH" ]; then
    echo -e "${GREEN}✅ Backend is healthy${NC}"
else
    echo -e "❌ Backend is not responding. Check logs: $DOCKER_COMPOSE logs backend"
    exit 1
fi

echo ""
echo "2️⃣  Starting frontend..."
$DOCKER_COMPOSE up -d frontend

echo "⏳ Waiting for frontend to compile..."
sleep 15

# Check if frontend is accessible
FRONTEND_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
if [ "$FRONTEND_CHECK" = "200" ]; then
    echo -e "${GREEN}✅ Frontend is running!${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend may still be starting up...${NC}"
    echo "   Check logs: $DOCKER_COMPOSE logs -f frontend"
fi

echo ""
echo "=============================="
echo -e "${GREEN}✅ Grapefruit is ready!${NC}"
echo "=============================="
echo ""
echo -e "${BLUE}Services:${NC}"
echo "  🌐 Frontend:  http://localhost:3000"
echo "  🔧 Backend:   http://localhost:5000"
echo "  🗄️  Database:  postgresql://localhost:5432/grapefruit"
echo ""
echo -e "${BLUE}Quick Actions:${NC}"
echo "  • View inventory:     curl http://localhost:5000/inventory"
echo "  • Simulate a day:     curl -X POST http://localhost:5000/simulate/day"
echo "  • Check pending:      curl http://localhost:5000/orders/pending"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo "  • All services:       $DOCKER_COMPOSE logs -f"
echo "  • Frontend only:      $DOCKER_COMPOSE logs -f frontend"
echo "  • Backend only:       $DOCKER_COMPOSE logs -f backend"
echo ""
echo -e "${BLUE}Stop Services:${NC}"
echo "  • Stop all:           $DOCKER_COMPOSE down"
echo "  • Stop frontend:      $DOCKER_COMPOSE stop frontend"
echo ""
echo "=============================="
echo ""
echo "Opening browser to http://localhost:3000 in 3 seconds..."
sleep 3

# Try to open browser (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:3000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
else
    echo "Please open http://localhost:3000 in your browser"
fi

echo ""
echo "📺 Showing frontend logs (Ctrl+C to exit):"
echo ""
$DOCKER_COMPOSE logs -f frontend
