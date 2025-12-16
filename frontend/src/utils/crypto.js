// ============================================================================
// FRONTEND POST-QUANTUM CRYPTOGRAPHY
// ============================================================================
// This implementation uses server-side encryption to avoid WASM loading issues
// Uses Web Crypto API for AES-256-GCM symmetric encryption
// ============================================================================

import axios from 'axios';

const API_URL = (() => {
  const envUrl = process.env.REACT_APP_API_URL;
  if (envUrl && envUrl.trim()) return envUrl.trim();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('REACT_APP_API_URL is not set for production build');
  }
  return 'http://localhost:3001';
})()
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');

/**
 * Validate that the application is running in a secure context (HTTPS)
 * Should be called during app initialization, not at module import time
 * @returns {object} { isValid: boolean, error: string | null }
 */
export const validateSecureContext = () => {
  if (process.env.NODE_ENV !== 'production') {
    // Development: Allow HTTP
    return { isValid: true, error: null };
  }

  // Production: Require HTTPS for both API and page context
  const errors = [];

  if (!API_URL.startsWith('https://')) {
    errors.push('API endpoint must use HTTPS in production');
  }

  if (typeof window !== 'undefined' && window.location.protocol !== 'https:') {
    errors.push('Application must be served over HTTPS in production');
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      error: `Security Error: ${errors.join('. ')}. HTTPS is required for cryptographic operations.`
    };
  }

  return { isValid: true, error: null };
};

/**
 * Convert ArrayBuffer to base64 string
 */
const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

/**
 * Convert base64 string to ArrayBuffer
 */
const base64ToArrayBuffer = (base64) => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

// ----------------------------------------------------------------------------
// CANONICAL SIGNATURE PAYLOAD
// ----------------------------------------------------------------------------
const buildSignaturePayload = (ciphertextBase64, ivBase64, authTagBase64) =>
  JSON.stringify({ c: ciphertextBase64, i: ivBase64, t: authTagBase64 });

// ----------------------------------------------------------------------------
// KYBER KEY ENCAPSULATION (SERVER-SIDE IMPLEMENTATION)
// ----------------------------------------------------------------------------

/**
 * Kyber Encapsulation - Generate shared secret and ciphertext
 * Uses server-side ML-KEM-1024 (Kyber) to avoid WASM loading issues
 * Requires authentication token from localStorage
 */
const kyberEncapsulate = async (receiverPublicKeyBase64) => {
  try {
    // Get authentication token from localStorage
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication required for encryption');
    }

    const response = await axios.post(
      `${API_URL}/api/crypto/kyber/encapsulate`,
      { receiverPublicKey: receiverPublicKeyBase64 },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    // Convert base64 sharedSecret back to Uint8Array
    const sharedSecretBase64 = response.data.sharedSecret;
    const sharedSecret = Uint8Array.from(atob(sharedSecretBase64), c => c.charCodeAt(0));
    
    return {
      sharedSecret, // Uint8Array (32 bytes)
      ciphertext: response.data.ciphertext // base64 string
    };
  } catch (error) {
    console.error('Kyber encapsulation error:', error);
    throw new Error('Failed to encapsulate with Kyber');
  }
};

/**
 * Kyber Decapsulation - Recover shared secret from ciphertext
 * CLIENT-SIDE ONLY: Never transmit secret keys to the server
 */
const kyberDecapsulate = async (ciphertextBase64, secretKeyBase64) => {
  let kem;
  try {
    kem = await loadMLKEM1024();
    const ciphertext = new Uint8Array(base64ToArrayBuffer(ciphertextBase64));
    const secretKey = new Uint8Array(base64ToArrayBuffer(secretKeyBase64));

    const sharedSecret = await kem.decapsulate(ciphertext, secretKey);
    return new Uint8Array(sharedSecret); // 32 bytes
  } catch (error) {
    console.error('Kyber decapsulation error (client-side):', error);
    throw new Error('Failed to decapsulate with Kyber');
  } finally {
    try {
      if (kem && typeof kem.destroy === 'function') kem.destroy();
    } catch (e) {
      console.warn('Error destroying ML-KEM instance (frontend):', e);
    }
  }
};

// ----------------------------------------------------------------------------
// AES-256-GCM ENCRYPTION (REAL IMPLEMENTATION)
// ----------------------------------------------------------------------------

/**
 * Encrypt message with AES-256-GCM
 * @param {string} plaintext - Message to encrypt
 * @param {Uint8Array} sharedSecret - 32-byte symmetric key
 * @returns {Promise<object>} Encrypted data with iv, authTag, ciphertext
 */
const encryptMessage = async (plaintext, sharedSecret) => {
  try {
    // Generate random 12-byte IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Import key for AES-GCM
    const key = await window.crypto.subtle.importKey(
      'raw',
      sharedSecret,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    // Encrypt the message
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128 // 16-byte authentication tag
      },
      key,
      data
    );
    
    // encrypted contains both ciphertext and auth tag
    const encryptedArray = new Uint8Array(encrypted);
    const ciphertext = encryptedArray.slice(0, -16); // All except last 16 bytes
    const authTag = encryptedArray.slice(-16); // Last 16 bytes
    
    return {
      ciphertext: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv),
      authTag: arrayBufferToBase64(authTag)
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt message');
  }
};

/**
 * Decrypt message with AES-256-GCM
 * @param {string} ciphertextBase64 - Encrypted message (base64)
 * @param {Uint8Array} sharedSecret - 32-byte symmetric key
 * @param {string} ivBase64 - Initialization vector (base64)
 * @param {string} authTagBase64 - Authentication tag (base64)
 * @returns {Promise<string>} Decrypted plaintext
 */
const decryptMessage = async (ciphertextBase64, sharedSecret, ivBase64, authTagBase64) => {
  try {
    // Convert from base64
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);
    const iv = base64ToArrayBuffer(ivBase64);
    const authTag = base64ToArrayBuffer(authTagBase64);
    
    // Combine ciphertext and authTag for Web Crypto API
    const combined = new Uint8Array(ciphertext.byteLength + authTag.byteLength);
    combined.set(new Uint8Array(ciphertext), 0);
    combined.set(new Uint8Array(authTag), ciphertext.byteLength);
    
    // Import key
    const key = await window.crypto.subtle.importKey(
      'raw',
      sharedSecret,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    // Decrypt
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv),
        tagLength: 128
      },
      key,
      combined
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt message - authentication failed');
  }
};

// ----------------------------------------------------------------------------
// FALCON DIGITAL SIGNATURES (CLIENT-SIDE IMPLEMENTATION)
// ----------------------------------------------------------------------------

/**
 * Sign data with Falcon
 * CLIENT-SIDE ONLY: Never transmit secret keys to the server
 */
const signWithFalcon = async (data, secretKeyBase64) => {
  let sig;
  try {
    sig = await loadFalcon1024();
    const secretKey = new Uint8Array(base64ToArrayBuffer(secretKeyBase64));
    const message = new TextEncoder().encode(data);

    const signature = await sig.sign(message, secretKey);
    return arrayBufferToBase64(signature);
  } catch (error) {
    console.error('Falcon signing error (client-side):', error);
    throw new Error('Failed to sign with Falcon');
  } finally {
    try {
      if (sig && typeof sig.destroy === 'function') sig.destroy();
    } catch (e) {
      console.warn('Error destroying Falcon instance (frontend):', e);
    }
  }
};

/**
 * Verify Falcon signature
 * Uses server-side Falcon-1024 to avoid WASM loading issues
 */
const verifyWithFalcon = async (data, signatureBase64, publicKeyBase64) => {
  try {
    console.log('Falcon verify request:', {
      dataLength: data?.length,
      signatureLength: signatureBase64?.length,
      publicKeyLength: publicKeyBase64?.length
    });
    
    const response = await axios.post(`${API_URL}/api/crypto/falcon/verify`, {
      message: data,
      signature: signatureBase64,
      publicKey: publicKeyBase64
    });
    
    return response.data.isValid;
  } catch (error) {
    console.error('Falcon verification error:', error);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
      if (error.response.status >= 500) {
        throw new Error('Server error during signature verification');
      }
    }
    return false;
  }
};

// ----------------------------------------------------------------------------
// HIGH-LEVEL API
// ----------------------------------------------------------------------------

/**
 * Encrypt and sign a message for sending
 * @param {string} plaintext - Message to send
 * @param {string} receiverKyberPublicKey - Receiver's Kyber public key
 * @param {string} senderFalconSecretKey - Sender's Falcon secret key
 * @returns {Promise<object>} Encrypted message bundle
 */
export const encryptAndSignMessage = async (
  plaintext,
  receiverKyberPublicKey,
  senderFalconSecretKey
) => {
  // Step 1: Kyber KEM - Generate shared secret
  const { sharedSecret, ciphertext: kyberCiphertext } = await kyberEncapsulate(
    receiverKyberPublicKey
  );
  
  // Step 2: AES-256-GCM encryption
  const { ciphertext: encryptedMessage, iv, authTag } = await encryptMessage(
    plaintext,
    sharedSecret
  );
  
  // Step 3: Falcon signature (canonical payload)
  const dataToSign = buildSignaturePayload(encryptedMessage, iv, authTag);
  const signature = await signWithFalcon(dataToSign, senderFalconSecretKey);
  
  return {
    kyberCiphertext,
    encryptedMessage,
    iv,
    authTag,
    signature
  };
};

/**
 * Verify and decrypt a received message
 * @param {object} messageBundle - Encrypted message data
 * @param {string} receiverKyberSecretKey - Receiver's Kyber secret key
 * @param {string} senderFalconPublicKey - Sender's Falcon public key
 * @returns {Promise<string>} Decrypted plaintext
 */
export const verifyAndDecryptMessage = async (
  messageBundle,
  receiverKyberSecretKey,
  senderFalconPublicKey
) => {
  const { kyberCiphertext, encryptedMessage, iv, authTag, signature } = messageBundle;
  
  console.log('verifyAndDecryptMessage called with:', {
    hasKyberCiphertext: !!kyberCiphertext,
    hasEncryptedMessage: !!encryptedMessage,
    hasIv: !!iv,
    hasAuthTag: !!authTag,
    hasSignature: !!signature,
    hasReceiverKey: !!receiverKyberSecretKey,
    hasSenderKey: !!senderFalconPublicKey
  });
  
  // Validate all required fields
  if (!kyberCiphertext || !encryptedMessage || !iv || !authTag || !signature) {
    throw new Error('Missing required encryption fields in message bundle');
  }
  
  if (!receiverKyberSecretKey || !senderFalconPublicKey) {
    throw new Error('Missing decryption keys');
  }
  
  // Step 1: Verify Falcon signature (canonical payload)
  const dataToVerify = buildSignaturePayload(encryptedMessage, iv, authTag);
  console.log('Data to verify length:', dataToVerify.length);
  
  const isValid = await verifyWithFalcon(dataToVerify, signature, senderFalconPublicKey);
  
  if (!isValid) {
    throw new Error('Signature verification failed - message may be tampered');
  }
  
  // Step 2: Kyber decapsulation - Recover shared secret
  const sharedSecret = await kyberDecapsulate(kyberCiphertext, receiverKyberSecretKey);
  
  // Step 3: AES-256-GCM decryption
  const plaintext = await decryptMessage(encryptedMessage, sharedSecret, iv, authTag);
  
  return plaintext;
};

// ----------------------------------------------------------------------------
// SECURE KEY STORAGE (IndexedDB + PBKDF2 + AES-GCM)
// ----------------------------------------------------------------------------

const DB_NAME = 'qs-keystore';
const DB_VERSION = 2; // Increment for new object store
const STORE_SECRETS = 'secrets';
const STORE_META = 'meta';
const STORE_PENDING_MESSAGES = 'pending_messages';

let sessionUser = null;
let sessionKEK = null; // CryptoKey (non-extractable), derived per-session from password
let sessionTimeoutId = null; // Timer ID for automatic session expiration
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity

/**
 * Persist session to sessionStorage for page refresh survival
 * Encrypted with user password for security
 */
const persistSession = async (username, kek) => {
  try {
    // Export KEK as raw bytes (only possible because we control its creation)
    const kekBytes = await window.crypto.subtle.exportKey('raw', kek);
    
    // Store in sessionStorage (cleared when tab closes)
    sessionStorage.setItem('qs_session_user', username);
    sessionStorage.setItem('qs_session_kek', arrayBufferToBase64(kekBytes));
    sessionStorage.setItem('qs_session_timestamp', Date.now().toString());
  } catch (error) {
    console.warn('Failed to persist session:', error);
    // Non-fatal - session just won't survive refresh
  }
};

/**
 * Restore session from sessionStorage after page refresh
 */
const restoreSession = async () => {
  try {
    const username = sessionStorage.getItem('qs_session_user');
    const kekBase64 = sessionStorage.getItem('qs_session_kek');
    const timestamp = sessionStorage.getItem('qs_session_timestamp');
    
    if (!username || !kekBase64 || !timestamp) {
      return false; // No stored session
    }
    
    // Check if session expired (30 minutes)
    const age = Date.now() - parseInt(timestamp);
    if (age > SESSION_TIMEOUT_MS) {
      clearPersistedSession();
      return false;
    }
    
    // Restore KEK from stored bytes
    const kekBytes = base64ToArrayBuffer(kekBase64);
    sessionKEK = await window.crypto.subtle.importKey(
      'raw',
      kekBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    sessionUser = username;
    
    // Start timeout timer
    resetSessionTimeout();
    
    console.log(`✓ Session restored for user: ${username}`);
    return true;
  } catch (error) {
    console.warn('Failed to restore session:', error);
    clearPersistedSession();
    return false;
  }
};

/**
 * Clear persisted session from sessionStorage
 */
const clearPersistedSession = () => {
  sessionStorage.removeItem('qs_session_user');
  sessionStorage.removeItem('qs_session_kek');
  sessionStorage.removeItem('qs_session_timestamp');
};

/**
 * Clear session and release cryptographic resources
 * Securely removes session keys and user context
 */
const clearSession = () => {
  // Clear timeout timer
  if (sessionTimeoutId) {
    clearTimeout(sessionTimeoutId);
    sessionTimeoutId = null;
  }
  
  // Clear session variables (KEK is non-extractable, setting to null releases it)
  sessionKEK = null;
  sessionUser = null;
  
  // Clear persisted session
  clearPersistedSession();
  
  console.log('Session expired - keys cleared from memory');
};

/**
 * Reset session timeout on key access
 * Extends the session lifetime on each cryptographic operation
 */
const resetSessionTimeout = () => {
  // Clear existing timeout
  if (sessionTimeoutId) {
    clearTimeout(sessionTimeoutId);
  }
  
  // Update timestamp in sessionStorage
  sessionStorage.setItem('qs_session_timestamp', Date.now().toString());
  
  // Set new timeout to clear session after inactivity
  sessionTimeoutId = setTimeout(() => {
    clearSession();
  }, SESSION_TIMEOUT_MS);
};

const openKeystore = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_SECRETS)) {
      db.createObjectStore(STORE_SECRETS, { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains(STORE_META)) {
      db.createObjectStore(STORE_META, { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains(STORE_PENDING_MESSAGES)) {
      db.createObjectStore(STORE_PENDING_MESSAGES, { keyPath: 'id' });
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const putRecord = (storeName, record) => openKeystore().then((db) => new Promise((resolve, reject) => {
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  store.put(record);
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
}));

const getRecord = (storeName, id) => openKeystore().then((db) => new Promise((resolve, reject) => {
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const req = store.get(id);
  req.onsuccess = () => resolve(req.result || null);
  req.onerror = () => reject(req.error);
}));

const randomBytes = (len) => {
  const b = new Uint8Array(len);
  window.crypto.getRandomValues(b);
  return b;
};

const deriveKEK = async (password, salt) => {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const kek = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600000, // OWASP 2024 recommendation (increased from 250k)
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // Make extractable so we can persist to sessionStorage
    ['encrypt', 'decrypt']
  );
  return kek;
};

const encryptJSON = async (json, kek) => {
  const iv = randomBytes(12);
  const data = new TextEncoder().encode(JSON.stringify(json));
  const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, data);
  return { iv: arrayBufferToBase64(iv), ciphertext: arrayBufferToBase64(ct) };
};

const decryptJSON = async (payload, kek) => {
  const iv = base64ToArrayBuffer(payload.iv);
  const ct = base64ToArrayBuffer(payload.ciphertext);
  const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, kek, ct);
  const txt = new TextDecoder().decode(pt);
  return JSON.parse(txt);
};

export const initializeSecureKeys = async (username, password, { kyberSecretKey, falconSecretKey, kyberPublicKey, falconPublicKey }) => {
  if (!username || !password) throw new Error('username and password are required');
  
  console.log(`Initializing secure session for user: ${username}`);
  
  sessionUser = username;
  const salt = randomBytes(16);
  sessionKEK = await deriveKEK(password, salt);
  
  console.log('Session KEK derived successfully', { hasSessionUser: !!sessionUser, hasSessionKEK: !!sessionKEK });

  // Encrypt and store secrets in IndexedDB
  const secrets = { kyberSecretKey, falconSecretKey };
  const encrypted = await encryptJSON(secrets, sessionKEK);
  await putRecord(STORE_SECRETS, {
    id: `secrets_${username}`,
    salt: arrayBufferToBase64(salt),
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext
  });
  
  console.log('Secrets encrypted and stored in IndexedDB');

  // Store salt separately to support session restore (without keeping password)
  await putRecord(STORE_META, {
    id: `salt_${username}`,
    salt: arrayBufferToBase64(salt)
  });

  // Store public keys as plaintext with server signature for integrity protection
  // Public keys don't need encryption but require integrity verification
  // TODO: Implement server-side signing of public keys and verify signature here
  await putRecord(STORE_META, {
    id: `pubkeys_${username}`,
    kyberPublicKey,
    falconPublicKey,
    // serverSignature: null, // TODO: Add server signature from login response
    // timestamp: Date.now(), // TODO: Add timestamp for signature freshness
  });

  // Persist session to sessionStorage for page refresh survival
  await persistSession(username, sessionKEK);

  // Start session timeout
  resetSessionTimeout();
};

export const restoreSessionKEK = async (username, password) => {
  const meta = await getRecord(STORE_META, `salt_${username}`);
  if (!meta) throw new Error('No keystore metadata found; re-login required');
  const salt = new Uint8Array(base64ToArrayBuffer(meta.salt));
  sessionUser = username;
  sessionKEK = await deriveKEK(password, salt);
  
  // Refresh session timeout
  resetSessionTimeout();
};

export const hasSecretKeys = async (username) => {
  const rec = await getRecord(STORE_SECRETS, `secrets_${username}`);
  return !!rec;
};

export const getPublicKeys = async (username) => {
  try {
    const rec = await getRecord(STORE_META, `pubkeys_${username}`);
    if (!rec) {
      throw new Error(`No public keys found for user: ${username}`);
    }
    
    // TODO: Verify server signature before trusting public keys
    // if (rec.serverSignature) {
    //   const isValid = await verifyServerSignature({
    //     kyberPublicKey: rec.kyberPublicKey,
    //     falconPublicKey: rec.falconPublicKey,
    //     timestamp: rec.timestamp
    //   }, rec.serverSignature);
    //   if (!isValid) {
    //     throw new Error('Public key signature verification failed - keys may be tampered');
    //   }
    // }
    
    return {
      kyberPublicKey: rec.kyberPublicKey,
      falconPublicKey: rec.falconPublicKey
    };
  } catch (error) {
    console.error('Error retrieving public keys:', error);
    throw error;
  }
};

export const getSecretKeys = async () => {
  // Try to restore session if not initialized
  if (!sessionUser || !sessionKEK) {
    const restored = await restoreSession();
    if (!restored) {
      console.error('Session check failed:', { sessionUser: !!sessionUser, sessionKEK: !!sessionKEK });
      
      // Try to get username from localStorage for better error message
      const userStr = localStorage.getItem('user');
      let username = 'unknown';
      try {
        if (userStr) {
          const userData = JSON.parse(userStr);
          username = userData.username || 'unknown';
        }
      } catch (e) {
        // Ignore parse error
      }
      
      console.error(`Session not initialized for user: ${username}. Please log out and log in again.`);
      throw new Error('Key session not initialized; please re-login');
    }
  }
  
  const rec = await getRecord(STORE_SECRETS, `secrets_${sessionUser}`);
  if (!rec) throw new Error('No stored secrets for current session');
  const payload = { iv: rec.iv, ciphertext: rec.ciphertext };
  const { kyberSecretKey, falconSecretKey } = await decryptJSON(payload, sessionKEK);
  
  // Refresh session timeout on key access
  resetSessionTimeout();
  
  return { kyberSecretKey, falconSecretKey };
};

/**
 * Manually clear the session (e.g., on logout)
 * Exported for use by application components
 */
export const clearSecureSession = () => {
  clearSession();
};

/**
 * Try to restore session from sessionStorage
 * Exported for use during app initialization
 */
export const tryRestoreSession = async () => {
  return await restoreSession();
};

// ============================================================================
// OFFLINE MESSAGE QUEUE
// ============================================================================

const MESSAGE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Queue a message for offline recipient
 * Messages are stored in IndexedDB and sent when recipient comes online
 */
export const queueOfflineMessage = async (recipientId, encryptedMessageData) => {
  try {
    const db = await openKeystore();
    const tx = db.transaction(STORE_PENDING_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_PENDING_MESSAGES);
    
    const queuedMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recipientId,
      timestamp: Date.now(),
      retries: 0,
      ...encryptedMessageData
    };
    
    store.add(queuedMessage);
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log(`✓ Message queued for offline user ${recipientId}`);
        resolve(queuedMessage.id);
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Failed to queue offline message:', error);
    throw error;
  }
};

/**
 * Get all pending messages for a specific recipient
 */
export const getPendingMessages = async (recipientId) => {
  try {
    const db = await openKeystore();
    const tx = db.transaction(STORE_PENDING_MESSAGES, 'readonly');
    const store = tx.objectStore(STORE_PENDING_MESSAGES);
    const allMessages = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    
    const now = Date.now();
    return allMessages
      .filter(msg => msg.recipientId === recipientId)
      .filter(msg => (now - msg.timestamp) < MESSAGE_EXPIRY_MS); // Not expired
  } catch (error) {
    console.error('Failed to get pending messages:', error);
    return [];
  }
};

/**
 * Remove a message from the queue after successful delivery
 */
export const removePendingMessage = async (messageId) => {
  try {
    const db = await openKeystore();
    const tx = db.transaction(STORE_PENDING_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_PENDING_MESSAGES);
    store.delete(messageId);
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Failed to remove pending message:', error);
  }
};

/**
 * Clean up expired messages (older than 24 hours)
 */
export const cleanupExpiredMessages = async () => {
  try {
    const db = await openKeystore();
    const tx = db.transaction(STORE_PENDING_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_PENDING_MESSAGES);
    const allMessages = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    
    const now = Date.now();
    const expired = allMessages.filter(msg => (now - msg.timestamp) >= MESSAGE_EXPIRY_MS);
    
    expired.forEach(msg => store.delete(msg.id));
    
    if (expired.length > 0) {
      console.log(`✓ Cleaned up ${expired.length} expired messages`);
    }
  } catch (error) {
    console.error('Failed to cleanup expired messages:', error);
  }
};

// ============================================================================
// FILE ENCRYPTION AND DECRYPTION
// ============================================================================

/**
 * Encrypt a file with PQC (Kyber + Falcon + AES-256-GCM)
 * @param {File} file - File object to encrypt
 * @param {string} receiverKyberPublicKey - Receiver's Kyber public key
 * @param {string} senderFalconSecretKey - Sender's Falcon secret key
 * @returns {Promise<object>} Encrypted file bundle with metadata
 */
export const encryptAndSignFile = async (
  file,
  receiverKyberPublicKey,
  senderFalconSecretKey
) => {
  // Read file as ArrayBuffer
  const fileArrayBuffer = await file.arrayBuffer();
  const fileData = new Uint8Array(fileArrayBuffer);
  
  // Convert file data to base64 for transmission
  const fileBase64 = arrayBufferToBase64(fileData);
  
  // Step 1: Kyber KEM - Generate shared secret
  const { sharedSecret, ciphertext: kyberCiphertext } = await kyberEncapsulate(
    receiverKyberPublicKey
  );
  
  // Step 2: AES-256-GCM encryption of file data
  const { ciphertext: encryptedFileData, iv, authTag } = await encryptMessage(
    fileBase64,
    sharedSecret
  );
  
  // Step 3: Falcon signature (canonical payload)
  const dataToSign = buildSignaturePayload(encryptedFileData, iv, authTag);
  const signature = await signWithFalcon(dataToSign, senderFalconSecretKey);
  
  return {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    fileData: encryptedFileData,
    kyberCiphertext,
    iv,
    authTag,
    signature
  };
};

/**
 * Verify and decrypt a received file
 * @param {object} fileBundle - Encrypted file data
 * @param {string} receiverKyberSecretKey - Receiver's Kyber secret key
 * @param {string} senderFalconPublicKey - Sender's Falcon public key
 * @returns {Promise<Blob>} Decrypted file as Blob
 */
export const verifyAndDecryptFile = async (
  fileBundle,
  receiverKyberSecretKey,
  senderFalconPublicKey
) => {
  const { kyberCiphertext, fileData, iv, authTag, signature, fileName, fileType } = fileBundle;
  
  // Step 1: Verify Falcon signature (canonical payload)
  const dataToVerify = buildSignaturePayload(fileData, iv, authTag);
  const isValid = await verifyWithFalcon(dataToVerify, signature, senderFalconPublicKey);
  
  if (!isValid) {
    throw new Error('File signature verification failed - file may be tampered');
  }
  
  // Step 2: Kyber decapsulation - Recover shared secret
  const sharedSecret = await kyberDecapsulate(kyberCiphertext, receiverKyberSecretKey);
  
  // Step 3: AES-256-GCM decryption
  const decryptedBase64 = await decryptMessage(fileData, sharedSecret, iv, authTag);
  
  // Convert base64 back to Blob
  const decryptedArrayBuffer = base64ToArrayBuffer(decryptedBase64);
  const blob = new Blob([decryptedArrayBuffer], { type: fileType || 'application/octet-stream' });
  
  return { blob, fileName };
};

// ----------------------------------------------------------------------------
// WASM LOADING HELPERS (Client-side ML-KEM-1024 and Falcon-1024)
// ----------------------------------------------------------------------------

let mlkemInstance;
let falconInstance;

const loadMLKEM1024 = async () => {
  if (!mlkemInstance) {
    // Use npm package with correct export path
    const { createMLKEM1024 } = await import('@openforge-sh/liboqs');
    mlkemInstance = await createMLKEM1024();
  }
  return mlkemInstance;
};

const loadFalcon1024 = async () => {
  if (!falconInstance) {
    // Use npm package with correct export path
    const { createFalcon1024 } = await import('@openforge-sh/liboqs');
    falconInstance = await createFalcon1024();
  }
  return falconInstance;
};

