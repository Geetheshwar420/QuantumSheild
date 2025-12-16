#!/bin/bash

# QuantumShield - Development Setup Script
# This script sets up the development environment for QuantumShield

echo "🚀 QuantumShield Development Setup"
echo "=================================="
echo ""

# Check Node.js version
echo "📦 Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Error: Node.js 16 or higher is required"
    echo "   Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js version: $(node -v)"
echo ""

# Backend setup
echo "🔧 Setting up Backend..."
cd backend || exit

if [ ! -f ".env" ]; then
    echo "📝 Creating backend .env file..."
    cp .env.example .env || {
      echo "❌ Error: .env.example not found"
      exit 1
    }
    echo "✅ Created backend/.env (please update with your values)"
else
    echo "✅ Backend .env already exists"
fi

echo "📦 Installing backend dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Backend dependency installation failed"
    exit 1
fi
echo "✅ Backend dependencies installed"
echo ""

# Frontend setup
echo "🎨 Setting up Frontend..."
cd ../frontend || exit

if [ ! -f ".env" ]; then
    echo "📝 Creating frontend .env file..."
    cp .env.example .env
    echo "✅ Created frontend/.env"
else
    echo "✅ Frontend .env already exists"
fi

echo "📦 Installing frontend dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Frontend dependency installation failed"
    exit 1
fi
echo "✅ Frontend dependencies installed"
echo ""

cd ..

echo "🎉 Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo "   1. Update backend/.env with your JWT_SECRET"
echo "   2. Start backend:  cd backend && npm run dev"
echo "   3. Start frontend: cd frontend && npm start"
echo ""
echo "   Backend will run on:  http://localhost:3001"
echo "   Frontend will run on: http://localhost:3000"
echo ""
echo "📖 For more information:"
echo "   - QUICKSTART.md - Local development guide"
echo "   - DEPLOYMENT.md - Production deployment guide"
echo "   - README.md - Full documentation"
echo ""
