const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const { generateKyberKeys, generateFalconKeys, signWithFalcon, verifyWithFalcon } = require('../crypto/pqc');
const { generateToken } = require('../middleware/authMiddleware');
const crypto = require('crypto');

// @route   POST api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ msg: 'Please provide username and password' });
    }

    try {
        const kyberKeys = generateKyberKeys();
        const falconKeys = generateFalconKeys();
        const bcrypt = require('bcrypt');
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const stmt = db.prepare('INSERT INTO users (username, kyber_public_key, falcon_public_key, password_hash) VALUES (?, ?, ?, ?)');
        stmt.run(username, kyberKeys.publicKey, falconKeys.publicKey, passwordHash, function(err) {
            if (err) {
                return res.status(400).json({ msg: 'Username already taken' });
            }
            res.json({
                userId: this.lastID,
                username,
                kyberPublicKey: kyberKeys.publicKey,
                // Note: In a real app, secret keys stay client-side; returned now for placeholder usage.
                kyberSecretKey: kyberKeys.secretKey,
                falconPublicKey: falconKeys.publicKey,
                falconSecretKey: falconKeys.secretKey
            });
        });
        stmt.finalize();
    } catch (e) {
        console.error('Registration error:', e);
        res.status(500).json({ msg: 'Server error during registration' });
    }
});

// @route   POST api/auth/challenge
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

    db.get('SELECT id, falcon_public_key, password_hash FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.status(400).json({ msg: 'User not found' });
        }

        // If password provided, attempt password auth first
        if (password) {
          try {
            const bcrypt = require('bcrypt');
            const passOk = await bcrypt.compare(password, user.password_hash || '');
            if (!passOk) {
              return res.status(401).json({ msg: 'Invalid password' });
            }
            const token = generateToken(user.id, username);
            return res.json({ message: 'Login successful', token, userId: user.id, username });
          } catch (e) {
            console.error('Password auth error:', e);
            return res.status(500).json({ msg: 'Server error during password authentication' });
          }
        }

        // Fallback to signature-based challenge flow if password not supplied
        if (!challenge || !signature) {
          return res.status(400).json({ msg: 'Please provide password OR challenge and signature' });
        }

        const isValid = verifyWithFalcon(challenge, signature, user.falcon_public_key);

        if (isValid) {
            const token = generateToken(user.id, username);
            res.json({ 
                message: 'Login successful',
                token,
                userId: user.id,
                username
            });
        } else {
            res.status(401).json({ msg: 'Login failed: Invalid signature' });
        }
    });
});

module.exports = router;
