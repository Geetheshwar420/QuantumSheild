@echo off
REM QuantumShield - Development Setup Script (Windows)
REM This script sets up the development environment for QuantumShield

echo.
echo ================================
echo QuantumShield Development Setup
echo ================================
echo.

REM Check Node.js installation
echo Checking Node.js version...
node -v >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed
    echo Please install Node.js 16 or higher from https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js version: 
node -v
echo.

REM Backend setup
echo Setting up Backend...
pushd backend
if errorlevel 1 (
    echo Error: Failed to change to backend directory
    pause
    exit /b 1
)

if not exist .env.example (
    echo Error: .env.example not found in backend directory
    popd
    pause
    exit /b 1
)

if not exist .env (
    echo Creating backend .env file...
    copy .env.example .env
    if errorlevel 1 (
        echo Error: Failed to copy .env.example to .env
        popd
        pause
        exit /b 1
    )
    echo Created backend\.env - please update with your values
) else (
    echo Backend .env already exists
)

echo Installing backend dependencies...
call npm install
if errorlevel 1 (
    echo Backend dependency installation failed
    popd
    pause
    exit /b 1
)
echo Backend dependencies installed
popd
echo.

REM Frontend setup
echo Setting up Frontend...
pushd frontendif errorlevel 1 (
    echo Error: Failed to change to frontend directory
    pause
    exit /b 1
)

if not exist .env.example (
    echo Error: .env.example not found in frontend directory
    popd
    pause
    exit /b 1
)

if not exist .env (
    echo Creating frontend .env file...
    copy .env.example .env
    if errorlevel 1 (
        echo Error: Failed to copy .env.example to .env
        popd
        pause
        exit /b 1
    )
    echo Created frontend\.env
) else (
    echo Frontend .env already exists
)

echo Installing frontend dependencies...
call npm install
if errorlevel 1 (
    echo Frontend dependency installation failed
    popd
    pause
    exit /b 1
)
echo Frontend dependencies installed
popd
echo.

echo.
echo ================================
echo Setup Complete!
echo ================================
echo.
echo Next Steps:
echo   1. Update backend\.env with your JWT_SECRET
echo   2. Start backend:  cd backend ^&^& npm run dev
echo   3. Start frontend: cd frontend ^&^& npm start
echo.
echo   Backend will run on:  http://localhost:3001
echo   Frontend will run on: http://localhost:3000
echo.
echo For more information:
echo   - QUICKSTART.md - Local development guide
echo   - DEPLOYMENT.md - Production deployment guide
echo   - README.md - Full documentation
echo.
pause
