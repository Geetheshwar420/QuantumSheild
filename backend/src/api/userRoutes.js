import express from 'express';
const router = express.Router();
import { db } from '../database/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { logger } from '../middleware/security.js';

// @route   GET api/users/:userId/keys
// @desc    Get user's public keys for encryption
// @access  Private (requires JWT authentication)
router.get('/:userId/keys', verifyToken, async (req, res) => {
  const { userId: userIdParam } = req.params;
  
  // Input validation: Ensure userId is a valid positive integer
  const userId = parseInt(userIdParam, 10);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ 
      error: 'Invalid userId: must be a positive integer',
      code: 'INVALID_INPUT'
    });
  }
  
  // Authorization: Any authenticated user can retrieve public keys of other users
  // This is necessary for end-to-end encryption (users need recipients' public keys)
  // Only public keys are exposed - secret keys are never transmitted
  
  try {
    // Use promise-based approach: db.prepare().get() returns a promise
    const user = await db.prepare('SELECT kyber_public_key, falcon_public_key FROM users WHERE id = ?').get(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      kyberPublicKey: user.kyber_public_key,
      falconPublicKey: user.falcon_public_key
    });
  } catch (err) {
    // Log error with structured logging (no sensitive data exposure)
    logger.error('Database error while retrieving user public keys', {
      userId,
      errorCode: err.code,
      // Only include error message, not full error object or stack trace
      errorMessage: err.message
    });
    return res.status(500).json({ error: 'Failed to retrieve keys' });
  }
});

export default router;
