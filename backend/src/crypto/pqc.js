import crypto from 'crypto';
import { createMLKEM1024, createFalcon1024 } from '@openforge-sh/liboqs';

// ============================================================================
// REAL POST-QUANTUM CRYPTOGRAPHY IMPLEMENTATION
// ============================================================================
// Using @openforge-sh/liboqs for ML-KEM (Kyber) and Falcon
// This provides NIST-standardized ML-KEM and Falcon algorithms
// ============================================================================

// ----------------------------------------------------------------------------
// KYBER KEY ENCAPSULATION MECHANISM (KEM) - REAL IMPLEMENTATION
// ----------------------------------------------------------------------------

const generateKyberKeys = async () => {
  let kem;
  try {
    kem = await createMLKEM1024();
    const { publicKey, secretKey } = await kem.generateKeyPair();
    
    // publicKey and secretKey are Uint8Arrays
    return {
      publicKey: Buffer.from(publicKey).toString('base64'),
      secretKey: Buffer.from(secretKey).toString('base64')
    };
  } catch (error) {
    console.error('Error generating Kyber keys:', error);
    throw new Error('Failed to generate Kyber keys');
  } finally {
    kem?.destroy();
  }
};
// Kyber Encapsulation: Encrypt a symmetric key with receiver's public key
const kyberEncapsulate = async (receiverPublicKeyBase64) => {
  let kem;
  try {
    kem = await createMLKEM1024();
    // Ensure we convert base64 to Uint8Array correctly
    const publicKey = new Uint8Array(Buffer.from(receiverPublicKeyBase64, 'base64'));

    const { ciphertext, sharedSecret } = await kem.encapsulate(publicKey);

    return {
      ciphertext: Buffer.from(ciphertext).toString('base64'), // Send to receiver
      sharedSecret: Buffer.from(sharedSecret) // Use for AES encryption
    };
  } catch (error) {
    console.error('Error in Kyber encapsulation:', error);
    // Keep existing behavior: wrap with a generic error
    throw new Error('Failed to encapsulate with Kyber');
  } finally {
    try {
      if (kem && typeof kem.destroy === 'function') {
        kem.destroy();
      }
    } catch (destroyErr) {
      console.warn('Error destroying MLKEM instance:', destroyErr);
    }
  }
};

// Kyber Decapsulation: Decrypt the symmetric key with your secret key
const kyberDecapsulate = async (ciphertextBase64, secretKeyBase64) => {
  let kem;
  try {
    kem = await createMLKEM1024();
    const ciphertext = new Uint8Array(Buffer.from(ciphertextBase64, 'base64'));
    const secretKey = new Uint8Array(Buffer.from(secretKeyBase64, 'base64'));

    const sharedSecret = await kem.decapsulate(ciphertext, secretKey);
    return Buffer.from(sharedSecret); // Buffer (32 bytes for ML-KEM-1024)
  } catch (error) {
    console.error('Error in Kyber decapsulation:', error);
    // Rethrow original error to preserve stack/context
    throw error;
  } finally {
    try {
      if (kem && typeof kem.destroy === 'function') {
        kem.destroy(); // Ensure cleanup even on failure
      }
    } catch (destroyErr) {
      console.warn('Error destroying MLKEM instance:', destroyErr);
    }
  }
};

// ----------------------------------------------------------------------------
// AES-256-GCM SYMMETRIC ENCRYPTION (REAL IMPLEMENTATION)
// ----------------------------------------------------------------------------
// This is REAL encryption using Node.js built-in crypto

const encryptMessage = (plaintext, sharedSecret) => {
  try {
    // Generate random IV (12 bytes recommended for GCM)
    const iv = crypto.randomBytes(12);
    
    // Create cipher with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', sharedSecret, iv);
    
    // Encrypt the message
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Get authentication tag (16 bytes)
    const authTag = cipher.getAuthTag();
    
    return {
      ciphertext: encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt message');
  }
};

const decryptMessage = (ciphertext, sharedSecret, iv, authTag) => {
  try {
    // Convert from base64
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');
    
    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', sharedSecret, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    // Decrypt the message
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt message - authentication failed');
  }
};

// ----------------------------------------------------------------------------
// FALCON DIGITAL SIGNATURES - REAL IMPLEMENTATION
// ----------------------------------------------------------------------------

const generateFalconKeys = async () => {
  let sig;
  try {
    // Create instance before performing operations
    sig = await createFalcon1024();
    const { publicKey, secretKey } = await sig.generateKeyPair();

    return {
      publicKey: Buffer.from(publicKey).toString('base64'),
      secretKey: Buffer.from(secretKey).toString('base64')
    };
  } catch (error) {
    console.error('Error generating Falcon keys:', error);
    throw new Error('Failed to generate Falcon keys');
  } finally {
    try {
      if (sig && typeof sig.destroy === 'function') {
        sig.destroy();
      }
    } catch (destroyErr) {
      console.warn('Error destroying Falcon instance:', destroyErr);
    }
  }
};

const signWithFalcon = async (data, secretKeyBase64) => {
  let sig;
  try {
    sig = await createFalcon1024();
    const secretKey = new Uint8Array(Buffer.from(secretKeyBase64, 'base64'));
    const message = Buffer.from(data, 'utf8');

    const signature = await sig.sign(message, secretKey);
    return Buffer.from(signature).toString('base64');
  } catch (error) {
    console.error('Error signing with Falcon:', error);
    throw new Error('Failed to sign with Falcon');
  } finally {
    try {
      if (sig && typeof sig.destroy === 'function') {
        sig.destroy();
      }
    } catch (destroyErr) {
      console.warn('Error destroying Falcon instance:', destroyErr);
    }
  }
};

const verifyWithFalcon = async (data, signatureBase64, publicKeyBase64) => {
  let sig;
  try {
    sig = await createFalcon1024();
    const signatureBytes = new Uint8Array(Buffer.from(signatureBase64, 'base64'));
    const publicKey = new Uint8Array(Buffer.from(publicKeyBase64, 'base64'));
    const message = Buffer.from(data, 'utf8');

    const isValid = await sig.verify(message, signatureBytes, publicKey);
    return isValid;
  } catch (error) {
    console.error('Error verifying Falcon signature:', error);
    return false;
  } finally {
    try {
      if (sig && typeof sig.destroy === 'function') {
        sig.destroy();
      }
    } catch (destroyErr) {
      console.warn('Error destroying Falcon instance:', destroyErr);
    }
  }
};

// ----------------------------------------------------------------------------
// HIGH-LEVEL ENCRYPTION FLOW
// ----------------------------------------------------------------------------

/**
 * Complete message encryption flow:
 * 1. Generate ephemeral symmetric key using Kyber KEM
 * 2. Encrypt message with AES-256-GCM
 * 3. Sign encrypted message with Falcon
 * 
 * @param {string} plaintext - Message to encrypt
 * @param {string} receiverKyberPublicKey - Receiver's Kyber public key (base64)
 * @param {string} senderFalconSecretKey - Sender's Falcon private key (base64)
 * @returns {Promise<object>} Encrypted message bundle
 */
const encryptAndSignMessage = async (plaintext, receiverKyberPublicKey, senderFalconSecretKey) => {
  // Step 1: Kyber KEM - Generate shared secret
  const { ciphertext: kyberCiphertext, sharedSecret } = await kyberEncapsulate(receiverKyberPublicKey);
  
  // Step 2: AES-256-GCM encryption
  const { ciphertext: encryptedMessage, iv, authTag } = encryptMessage(plaintext, sharedSecret);
  
  // Step 3: Falcon signature (sign the encrypted message)
  const dataToSign = encryptedMessage + iv + authTag;
  const signature = await signWithFalcon(dataToSign, senderFalconSecretKey);
  
  return {
    kyberCiphertext,      // Send to receiver to get shared secret
    encryptedMessage,     // AES-GCM encrypted message
    iv,                   // Initialization vector
    authTag,              // GCM authentication tag
    signature             // Falcon signature
  };
};

/**
 * Complete message decryption flow:
 * 1. Verify Falcon signature
 * 2. Decrypt Kyber ciphertext to get shared secret
 * 3. Decrypt message with AES-256-GCM
 * 
  // Step 1: Verify Falcon signature
  const dataToVerify = kyberCiphertext + encryptedMessage + iv + authTag;
  const isValid = await verifyWithFalcon(dataToVerify, signature, senderFalconPublicKey); * @returns {Promise<string>} Decrypted plaintext
 */
const verifyAndDecryptMessage = async (messageBundle, receiverKyberSecretKey, senderFalconPublicKey) => {
  const { kyberCiphertext, encryptedMessage, iv, authTag, signature } = messageBundle;
  
  // Step 1: Verify Falcon signature
  const dataToVerify = encryptedMessage + iv + authTag;
  const isValid = await verifyWithFalcon(dataToVerify, signature, senderFalconPublicKey);
  
  if (!isValid) {
    throw new Error('Signature verification failed - message may be tampered');
  }
  
  // Step 2: Kyber decapsulation - Recover shared secret
  const sharedSecret = await kyberDecapsulate(kyberCiphertext, receiverKyberSecretKey);
  
  // Step 3: AES-256-GCM decryption
  const plaintext = decryptMessage(encryptedMessage, sharedSecret, iv, authTag);
  
  return plaintext;
};

export {
  // Key generation
  generateKyberKeys,
  generateFalconKeys,
  
  // Low-level operations
  kyberEncapsulate,
  kyberDecapsulate,
  encryptMessage,
  decryptMessage,
  signWithFalcon,
  verifyWithFalcon,
  
  // High-level operations (recommended for use)
  encryptAndSignMessage,
  verifyAndDecryptMessage
};
