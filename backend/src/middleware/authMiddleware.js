import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current file directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from backend root directory
dotenv.config({ path: join(__dirname, '../../.env') });

// JWT_SECRET is validated at server startup in server.js
// This will never be undefined/empty because the server exits if it's not set
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '3600'; // 1 hour in seconds

console.log('JWT_SECRET loaded:', JWT_SECRET ? 'Yes ✓' : 'No ✗');

// Verify JWT token and extract user info
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  // Extract token from "Bearer <token>" format
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired' });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'Token verification failed' });
  }
};

// Generate JWT token
const generateToken = (userId, username) => {
  return jwt.sign(
    { id: userId, username: username },
    JWT_SECRET,
    { expiresIn: parseInt(JWT_EXPIRY) }
  );
};

export {
  verifyToken,
  generateToken,
  JWT_SECRET,
  JWT_EXPIRY
};
