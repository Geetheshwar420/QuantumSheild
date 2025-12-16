import express from 'express';
const router = express.Router();
import { db } from '../database/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';

// @route   GET api/keys/my-keys
// @desc    Retrieve authenticated user's PUBLIC cryptographic keys
// @access  Private (requires valid JWT token)
// @security Only returns PUBLIC keys for the authenticated user
// @security SECRET KEYS MUST NEVER BE TRANSMITTED - they are stored encrypted client-side
router.get('/my-keys', verifyToken, (req, res) => {
  const userId = req.userId; // From verifyToken middleware

  // SECURITY: Only select public key columns - secret keys must NEVER be transmitted
  db.get(
    'SELECT kyber_public_key, falcon_public_key FROM users WHERE id = ?',
    [userId],
    (err, user) => {
      if (err) {
        console.error('Error retrieving user public keys for userId:', userId);
        return res.status(500).json({ msg: 'Server error retrieving keys' });
      }

      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }

      // SECURITY: Only return public keys
      // Secret keys are never transmitted; they are managed client-side with secure storage
      res.json({
        keys: {
          kyberPublicKey: user.kyber_public_key,
          falconPublicKey: user.falcon_public_key
        }
      });
    }
  );
});

export default router;
