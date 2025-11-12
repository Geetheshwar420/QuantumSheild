const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'quantum_shield_secret_key_2024';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '3600'; // 1 hour in seconds

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

module.exports = {
  verifyToken,
  generateToken,
  JWT_SECRET,
  JWT_EXPIRY
};
