// ============================================================================
// CRYPTO API ROUTES - Server-side encryption operations
// ============================================================================
// Handles ONLY operations that involve PUBLIC data and AUTHENTICATED secret data:
// - Kyber Encapsulation (uses only PUBLIC keys, safe server-side)
// - Kyber Decapsulation (uses user's secret key from DB via JWT auth, never transmitted)
// - Falcon Signing (uses user's secret key from DB via JWT auth, never transmitted)
// - Falcon Verification (uses only PUBLIC keys, safe server-side)
//
// CRITICAL SECURITY DECISIONS:
// - Kyber DECAPSULATION: Server-side with DB-stored secret keys (like Falcon signing)
// - Falcon SIGNING: Server-side with DB-stored secret keys
// - Secret keys are ONLY fetched from DB, NEVER accepted in request bodies
// - All operations with secret data use JWT auth to identify the user
// ============================================================================
// SECURITY:
// - All routes require JWT authentication (verifyToken)
// - Strict rate limiting to prevent DoS via expensive PQC operations
// - Encapsulation: 10 requests per minute (CPU intensive)
// - Decapsulation: 20 requests per minute (CPU intensive)
// - Signing: 20 requests per minute (CPU intensive)
// - Verification: 20 requests per minute (CPU intensive)
// ============================================================================

import express from 'express';
import rateLimit from 'express-rate-limit';
import { kyberEncapsulate, kyberDecapsulate, verifyWithFalcon, signWithFalcon, generateFalconKeys } from '../crypto/pqc.js';
import { db } from '../database/db.js';
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

const decapsulateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute per user
  message: 'Too many decapsulation requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId?.toString() || req.ip
});

const signLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute per user
  message: 'Too many signing requests, please try again later',
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
// Kyber Decapsulation
// ============================================================================
// Protected: Authentication required, rate limiting (20/min)
// Uses the authenticated user's Kyber secret key from DB
// Client provides ciphertext; server recovers the shared secret
// Secret key never leaves server; decapsulation output is sent to client
router.post('/kyber/decapsulate', decapsulateLimiter, async (req, res) => {
  try {
    const { ciphertext } = req.body;

    // Validate presence and type
    if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
      return res.status(400).json({ error: 'ciphertext must be a non-empty base64 string' });
    }

    // Fetch user's Kyber secret key from DB (never from request body)
    const row = await db.get('SELECT kyber_secret_key FROM users WHERE id = ?', [req.userId]);

    if (!row || !row.kyber_secret_key) {
      console.error(`Kyber secret key not found for user ${req.userId}`);
      return res.status(500).json({ error: 'User Kyber keys not initialized' });
    }

    console.log(`Kyber decapsulation for user ${req.userId}`);

    // Decapsulate using user's secret key
    const sharedSecret = await kyberDecapsulate(ciphertext, row.kyber_secret_key);

    // Ensure consistent base64 output
    const sharedSecretB64 = Buffer.isBuffer(sharedSecret)
      ? sharedSecret.toString('base64')
      : Buffer.from(sharedSecret).toString('base64');

    res.json({ sharedSecret: sharedSecretB64 });
  } catch (error) {
    console.error('Kyber decapsulation error:', error);
    res.status(500).json({ error: 'Decapsulation failed' });
  }
});

// ============================================================================
// Falcon Signing
// ============================================================================
// Protected: Authentication required, rate limiting (20/min)
// Uses the authenticated user's Falcon secret key from DB
// Client provides canonical JSON data to sign; server produces signature
// Secret key never leaves server
router.post('/falcon/sign', signLimiter, async (req, res) => {
  try {
    const { data } = req.body;
    if (typeof data !== 'string' || !data.length) {
      return res.status(400).json({ error: 'data must be a non-empty string' });
    }

    // Fetch user's Falcon secret key from DB (never from request)
    let row = await db.get('SELECT falcon_secret_key FROM users WHERE id = ?', [req.userId]);

    // Lazy-generate Falcon keys if missing (backfill for legacy users)
    if (!row || !row.falcon_secret_key) {
      try {
        const { publicKey, secretKey } = await generateFalconKeys();
        await db.run('UPDATE users SET falcon_public_key = ?, falcon_secret_key = ? WHERE id = ?', [publicKey, secretKey, req.userId]);
        row = { falcon_secret_key: secretKey };
        console.log(`Backfilled Falcon keys for user ${req.userId}`);
      } catch (genErr) {
        console.error('Failed to backfill Falcon keys:', genErr);
        return res.status(500).json({ error: 'Unable to create signing keys for user' });
      }
    }

    const signature = await signWithFalcon(data, row.falcon_secret_key);
    return res.json({ signature });
  } catch (error) {
    console.error('Falcon signing error:', error);
    return res.status(500).json({ error: 'Signing failed' });
  }
});

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
