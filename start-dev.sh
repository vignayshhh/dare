#!/bin/bash

# Development Startup Script
# Ensures real Firebase data and development mode

echo "🚀 Starting Dare App in Development Mode..."
echo "📋 Using real Firebase data (mock data disabled)"
echo "🔍 Debug logging enabled"
echo "⚡ Hot reload active - changes will auto-restart server"

# Check if .env.development exists
if [ ! -f ".env.development" ]; then
    echo "⚠️  .env.development not found!"
    echo "📝 Copy .env.development.example to .env.development"
    cp .env.development.example .env.development
    echo "❗ Please update .env.development with your Firebase credentials"
    exit 1
fi

# Check if Firebase credentials are configured
if grep -q "your_real_api_key_here" .env.development; then
    echo "❗ Firebase credentials not configured in .env.development"
    echo "📝 Please edit .env.development with your real Firebase project credentials"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start development server
echo "🔄 Starting development server with real Firebase..."
npm run dev

echo "✅ Development server started!"
echo "🌐 App available at: http://localhost:3000"
echo "🔍 Open browser and test real users functionality"
echo ""
echo "📝 Development Tips:"
echo "  - Changes auto-restart server"
echo "  - Check console for real-time logs"
echo "  - Use React DevTools for debugging"
echo "  - Real Firebase data will be loaded"
