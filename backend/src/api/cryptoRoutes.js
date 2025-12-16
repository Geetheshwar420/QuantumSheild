// ============================================================================
// CRYPTO API ROUTES - Server-side encryption operations
// ============================================================================
// Handles ONLY operations that involve PUBLIC data:
// - Kyber Encapsulation (uses only PUBLIC keys, safe server-side)
// - Falcon Signing (done on client only - see frontend/src/utils/crypto.js)
// - Falcon Verification (uses only PUBLIC keys, safe server-side)
//
// CRITICAL SECURITY DECISIONS:
// - Kyber DECAPSULATION: Performed CLIENT-SIDE ONLY (secret keys never leave client)
// - Falcon SIGNING: Performed CLIENT-SIDE ONLY (secret keys never leave client)
// - Secret keys are NEVER accepted in request bodies
// - All operations with secret data stay on the client device
// ============================================================================
// SECURITY:
// - All routes require JWT authentication (verifyToken)
// - Strict rate limiting to prevent DoS via expensive PQC operations
// - Encapsulation: 10 requests per minute (CPU intensive)
// - Verification: 20 requests per minute (CPU intensive)
// - NO DECAPSULATION ENDPOINT (secret keys must never be transmitted)
// ============================================================================

import express from 'express';
import rateLimit from 'express-rate-limit';
import { kyberEncapsulate, verifyWithFalcon } from '../crypto/pqc.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Rate limiters for computationally expensive crypto operations
// Stricter limits than general API to prevent DoS
const encapsulateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per user
  message: 'Too many encapsulation requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Use userId from JWT for per-user limiting
  keyGenerator: (req) => req.userId?.toString() || req.ip
});

const verifyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute per user
  message: 'Too many signature verification requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId?.toString() || req.ip
});

// Apply authentication to ALL crypto routes
// All subsequent routes require valid JWT token
router.use(verifyToken);

// ============================================================================
// Kyber Encapsulation
// ============================================================================
// Protected: Authentication required, strict rate limiting (10/min)
// Uses ONLY the receiver's PUBLIC key - safe to compute server-side
// Returns ciphertext and shared secret for client to use in encryption
router.post('/kyber/encapsulate', encapsulateLimiter, async (req, res) => {
  try {
    const { receiverPublicKey } = req.body;

    // Validate presence and type
    if (typeof receiverPublicKey !== 'string' || receiverPublicKey.length === 0) {
      return res.status(400).json({ error: 'receiverPublicKey must be a non-empty base64 string' });
    }

    // Basic base64 format validation (no whitespace, proper charset/padding)
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    if (!base64Regex.test(receiverPublicKey) || receiverPublicKey.length % 4 !== 0) {
      return res.status(400).json({ error: 'receiverPublicKey is not valid base64' });
    }

    // Decode and validate expected ML-KEM-1024 public key length (1568 bytes)
    const EXPECTED_MLKEM1024_PUBKEY_LEN = 1568;
    const pubKeyBuf = Buffer.from(receiverPublicKey, 'base64');
    if (pubKeyBuf.length !== EXPECTED_MLKEM1024_PUBKEY_LEN) {
      return res.status(400).json({
        error: `receiverPublicKey has invalid length: expected ${EXPECTED_MLKEM1024_PUBKEY_LEN} bytes`
      });
    }

    // Log authenticated user activity (do not log key material)
    console.log(`Kyber encapsulation by user ${req.userId}`);

    // Call Kyber KEM. Our Kyber helper accepts base64 and converts internally.
    const result = await kyberEncapsulate(receiverPublicKey);

    // Ensure consistent base64 outputs
    const sharedSecretB64 = Buffer.isBuffer(result.sharedSecret)
      ? result.sharedSecret.toString('base64')
      : Buffer.from(result.sharedSecret).toString('base64');
    const ciphertextB64 = typeof result.ciphertext === 'string'
      ? result.ciphertext
      : Buffer.from(result.ciphertext).toString('base64');

    res.json({
      sharedSecret: sharedSecretB64,
      ciphertext: ciphertextB64
    });
  } catch (error) {
    console.error('Kyber encapsulation error:', error);
    res.status(500).json({ error: 'Encapsulation failed' });
  }
});

// ============================================================================
router.post('/falcon/verify', async (req, res) => {
  try {
    const { message, signature, publicKey } = req.body;
    
    if (!message || !signature || !publicKey) {
      return res.status(400).json({ error: 'message, signature, and publicKey are required' });
    }

    const isValid = await verifyWithFalcon(message, signature, publicKey);
    
    res.json({ isValid });
  } catch (error) {
    console.error('Falcon verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});// - Secret keys must NEVER be accessible to server logs/monitoring
// - End-to-end encryption requires keys to stay on client device
// - This prevents a critical vulnerability (CWE-522: Insufficiently Protected Credentials)
//
// If decapsulation was attempted server-side for performance:
// - Use client-side WASM (fix browser compatibility if needed)
// - Use pure JavaScript implementation (slower but portable)
// - Ensure WASM modules are properly loaded and initialized
// ============================================================================

// ============================================================================
// Falcon Signing - INTENTIONALLY REMOVED FOR SECURITY
// ============================================================================
// SECURITY DECISION: This endpoint has been removed to prevent secret key
// transmission over the network. Falcon signing MUST be performed
// client-side only, where secret keys remain under user control.
//
// IMPLEMENTATION: Falcon signing is implemented in:
//   - frontend/src/utils/crypto.js: encryptAndSignMessage()
//   - frontend/src/utils/crypto.js: encryptAndSignFile()
//
// RATIONALE:
// - Secret keys must NEVER be transmitted to the server
// - Secret keys must NEVER be accessible to server logs/monitoring
// - End-to-end encryption requires keys to stay on client device
// - This prevents a critical vulnerability (CWE-522: Insufficiently Protected Credentials)
// - Falcon signing, while CPU-intensive, must remain client-side for security
//
// PERFORMANCE: If client-side signing is slow:
// - Optimize WASM loading (cache, preload, parallel init)
// - Use Web Workers to prevent UI blocking
// - Consider chunking large messages
// ============================================================================

// ============================================================================
// Falcon Verification
// ============================================================================
// Protected: Authentication required, rate limiting (20/min)
// Uses ONLY the sender's PUBLIC key for verification - safe server-side
// Client provides message, signature, and sender's public key
router.post('/falcon/verify', verifyLimiter, async (req, res) => {
  try {
    const { message, signature, publicKey } = req.body;
    
    console.log('Falcon verify request by user', req.userId, {
      hasMessage: !!message,
      hasSignature: !!signature,
      hasPublicKey: !!publicKey,
      messageLength: message?.length,
      signatureLength: signature?.length,
      publicKeyLength: publicKey?.length
    });
    
    if (!message || !signature || !publicKey) {
      console.error('Missing required fields:', { message: !!message, signature: !!signature, publicKey: !!publicKey });
      return res.status(400).json({ error: 'message, signature, and publicKey are required' });
    }

    const isValid = await verifyWithFalcon(message, signature, publicKey);
    
    res.json({ isValid });
  } catch (error) {
    console.error('Falcon verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

export default router;
