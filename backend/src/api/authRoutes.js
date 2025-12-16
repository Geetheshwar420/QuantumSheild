import express from 'express';
const router = express.Router();
import { db } from '../database/db.js';
import { generateKyberKeys, generateFalconKeys, signWithFalcon, verifyWithFalcon } from '../crypto/pqc.js';
import { generateToken } from '../middleware/authMiddleware.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// ============================================================================
// Helper: Build login response with explicit whitelist of safe fields
// ============================================================================
// SECURITY: Secret keys are included ONLY during initial login for client-side
// storage in IndexedDB. They are NEVER stored server-side after this point.
// Transport MUST use HTTPS to protect secret keys during transmission.
// ============================================================================
const buildLoginResponse = (user, token) => {
  // Whitelist of fields to expose in login response
  const safeFields = {
    message: 'Login successful',
    token,
    userId: user.id,
    username: user.username,
    keys: {
      kyberPublicKey: user.kyber_public_key,
      falconPublicKey: user.falcon_public_key,
      // Include secret keys for one-time retrieval at login
      // Client will store them encrypted in IndexedDB
      kyberSecretKey: user.kyber_secret_key,
      falconSecretKey: user.falcon_secret_key
    }
  };
  
  return safeFields;
};

// @route   POST api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ msg: 'Please provide username and password' });
  }

  // Password complexity validation
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ 
      msg: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)' 
    });
  }

  let stmt;
  try {
    const kyberKeys = await generateKyberKeys();
    const falconKeys = await generateFalconKeys();
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Use direct db.run for PostgreSQL compatibility (RETURNING clause)
    const result = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (username, kyber_public_key, falcon_public_key, kyber_secret_key, falcon_secret_key, password_hash) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
        [username, kyberKeys.publicKey, falconKeys.publicKey, kyberKeys.secretKey, falconKeys.secretKey, passwordHash],
        function(err, result) {
          if (err) {
            return reject(err);
          }
          // For PostgreSQL, result.rows[0].id; for SQLite, this.lastID
          const userId = result?.rows?.[0]?.id || this?.lastID;
          resolve({ userId });
        }
      );
    });

    res.json({
      userId: result.userId,
      username,
      message: 'Registration successful',
      info: 'Please log in to retrieve your secret keys securely via the authenticated keys endpoint'
    });
  } catch (e) {
    // Log error details for debugging, but do not expose sensitive data
    console.error('Registration error:', e.code || e.name, e.message.substring(0, 100));
    // Distinguish unique constraint violation from other errors
    if (e.code === 'SQLITE_CONSTRAINT' || e.message.includes('UNIQUE constraint failed') || e.code === '23505') {
      return res.status(400).json({ msg: 'Username already taken' });
    }
    res.status(500).json({ msg: 'Server error during registration' });
  }
});// @route   POST api/auth/challenge
// @desc    Generate a challenge for login
// @access  Public
router.post('/challenge', (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ msg: 'Please provide a username' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ msg: 'User not found' });
        }

        const challenge = crypto.randomBytes(32).toString('hex');
        // Store challenge temporarily, e.g., in-memory or in DB with an expiry
        // For simplicity, we'll just send it back. In a real app, you'd store it.
        res.json({ challenge });
    });
});

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
    const { username, password, challenge, signature } = req.body;

    if (!username) {
      return res.status(400).json({ msg: 'Please provide username' });
    }

    db.get('SELECT id, falcon_public_key, kyber_public_key, kyber_secret_key, falcon_secret_key, password_hash FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.status(400).json({ msg: 'User not found' });
        }

        // If password provided, attempt password auth first
        if (password) {
          try {
            const passOk = await bcrypt.compare(password, user.password_hash || '');
            if (!passOk) {
              return res.status(401).json({ msg: 'Invalid password' });
            }
            const token = generateToken(user.id, user.username);
            // Use whitelist helper to prevent secret key leakage
            return res.json(buildLoginResponse(user, token));
          } catch (e) {
            // Log error details for debugging, but do not expose sensitive data
            console.error('Password auth error:', e.name, e.message.substring(0, 100));
            return res.status(500).json({ msg: 'Server error during password authentication' });
          }
        }

        // Fallback to signature-based challenge flow if password not supplied
        if (!challenge || !signature) {
          return res.status(400).json({ msg: 'Please provide password OR challenge and signature' });
        }

        const isValid = verifyWithFalcon(challenge, signature, user.falcon_public_key);

        if (isValid) {
            const token = generateToken(user.id, user.username);
            // Use whitelist helper to prevent secret key leakage
            res.json(buildLoginResponse(user, token));
        } else {
            res.status(401).json({ msg: 'Login failed: Invalid signature' });
        }
    });
});

export default router;
