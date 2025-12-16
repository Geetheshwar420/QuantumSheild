# QuantumShield - Quick Start Guide

## Local Development Setup

### Prerequisites
- Node.js >= 16.0.0
- npm >= 8.0.0

---

## Backend Setup

### 1. Navigate to backend directory
```bash
cd backend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Create environment file
```bash
# Copy the example file
cp .env.example .env
```

### 4. Start the development server
```bash
npm run dev
```

Backend will run on: **http://localhost:3001**

---

## Frontend Setup

### 1. Navigate to frontend directory (in a new terminal)
```bash
cd frontend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Create environment file
```bash
# Copy the example file
cp .env.example .env
```

### 4. Start the development server
```bash
npm start
```

Frontend will run on: **http://localhost:3000** (or port 3002 if 3000 is in use)

---

## Testing the Application

### 1. Register a new user
- Navigate to http://localhost:3000/register
- Create username and password (must meet complexity requirements)
- Password must have: 8+ chars, uppercase, lowercase, number, special char

### 2. Login
- Navigate to http://localhost:3000/login
- Enter your credentials

### 3. Add friends and chat
- Search for another user by username
- Send friend request
- Accept request from the other user
- Start chatting!

---

## Project Structure

```
QuantumShield/
├── backend/
│   ├── src/
│   │   ├── api/           # API routes
│   │   ├── crypto/        # Cryptography (PQC placeholders)
│   │   ├── database/      # SQLite database
│   │   ├── middleware/    # Auth middleware
│   │   └── server.js      # Main server file
│   ├── uploads/           # Uploaded files (gitignored)
│   ├── .env               # Environment variables (gitignored)
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/         # React pages
│   │   ├── App.js         # Main app component
│   │   └── index.js       # Entry point
│   ├── .env               # Environment variables (gitignored)
│   └── package.json
│
└── mobile/                # Flutter mobile app (not yet implemented)
```

---

## Available Scripts

### Backend
- `npm start` - Start production server
- `npm run dev` - Start development server with auto-reload
- `npm run prod` - Start production server with NODE_ENV=production

### Frontend
- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests

---

## Environment Variables

### Backend (.env)
```env
PORT=3001
NODE_ENV=development
JWT_SECRET=your_jwt_secret_key_change_in_production
JWT_EXPIRY=3600
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002
```

### Frontend (.env)
```env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_SOCKET_URL=http://localhost:3001
REACT_APP_ENV=development
```

---

## Common Issues

### Backend won't start
- Check if port 3001 is already in use
- Verify .env file exists and has correct values
- Run `npm install` to ensure all dependencies are installed

### Frontend won't connect to backend
- Verify backend is running on port 3001
- Check REACT_APP_API_URL in frontend/.env
- Clear browser cache and localStorage

### Database errors
- Delete `quantumshield.db` and restart backend (will recreate)
- Check file permissions on the database file

---

## Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed production deployment instructions.

---

## Features

✅ **Implemented:**
- User registration with password complexity validation
- Secure login with JWT authentication
- Friend request system
- Real-time messaging via Socket.IO
- File upload support
- Modern, responsive UI
- Glass-card design with animations

🚧 **Pending:**
- Real post-quantum cryptography (Kyber/Falcon)
- End-to-end encryption for messages
- Message encryption/decryption
- Mobile app integration
- Dark mode toggle
- Message read receipts
- Typing indicators

---

## Tech Stack

### Backend
- Node.js / Express
- Socket.IO (real-time communication)
- SQLite (database)
- JWT (authentication)
- bcrypt (password hashing)

### Frontend
- React
- React Router
- Framer Motion (animations)
- Tailwind CSS
- Axios
- Socket.IO Client

### Security
- Password complexity validation
- JWT token-based auth
- bcrypt password hashing
- CORS protection
- Input sanitization

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License.

---

## Support

For issues, questions, or contributions, please visit:
https://github.com/Geetheshwar420/QuantumSheild
