# QuantumShield Architecture & Cryptography Design

## Executive Summary

QuantumShield is a post-quantum cryptography-enabled secure communication platform. It implements NIST-standardized algorithms (CRYSTALS-Kyber, Falcon) to provide resistance against quantum computing threats while maintaining modern application standards.

---

## Cryptographic Foundation

### 1. CRYSTALS-Kyber (Key Encapsulation Mechanism)

**Overview**: Kyber is a post-quantum key encapsulation mechanism (KEM) that enables two parties to establish a shared secret securely.

**Technical Details**:
- **Algorithm Type**: Lattice-based cryptography
- **Security Level**: 256-bit (Kyber768)
- **Key Sizes**:
  - Public Key: 1,184 bytes
  - Secret Key: 2,400 bytes
  - Ciphertext: 1,088 bytes
  - Shared Secret: 32 bytes

**Flow**:
```
┌─────────────────────┐         ┌─────────────────────┐
│     Party A         │         │     Party B         │
├─────────────────────┤         ├─────────────────────┤
│                     │         │                     │
│ (pk_A, sk_A) ←─────────────────────→ (pk_B, sk_B)  │
│ Kyber.Keygen()      │         │ Kyber.Keygen()      │
│                     │         │                     │
│ Shares pk_A ────────────────────────→ Receives pk_A │
│                     │         │                     │
│                     │         │ (ct, ss_B) ←───────│
│                     │         │ Kyber.Encaps(pk_A) │
│                     │         │                     │
│ ss_A ←──────────────────────────────── Receives ct  │
│ Kyber.Decaps(ct, sk_A)        │                     │
│                     │         │                     │
│  ss_A == ss_B (Shared Secret) │                     │
│  Used to derive symmetric keys                      │
└─────────────────────┘         └─────────────────────┘
```

**Use Cases in QuantumShield**:
- User registration: Generate keypair for encryption
- Secure messaging: Establish per-message symmetric keys
- File transfer: Derive encryption keys for file content

### 2. Falcon (Digital Signature Scheme)

**Overview**: Falcon is a post-quantum signature scheme providing authentication and integrity.

**Technical Details**:
- **Algorithm Type**: Lattice-based cryptography
- **Security Level**: 512-bit (Falcon-512)
- **Key Sizes**:
  - Public Key: 897 bytes
  - Secret Key: 1,281 bytes
  - Signature: ≤ 690 bytes

**Flow**:
```
┌──────────────────────┐         ┌──────────────────────┐
│     Signer           │         │     Verifier         │
├──────────────────────┤         ├──────────────────────┤
│                      │         │                      │
│ (pk_sign, sk_sign)   │         │                      │
│ Falcon.Keygen()      │         │                      │
│                      │         │                      │
│ Shares pk_sign ──────────────────────→ Receives pk   │
│                      │         │                      │
│ signature ←──────────────────────────│                │
│ Falcon.Sign(msg, sk) │         │                      │
│                      │         │ Verify(msg, sig, pk)│
│                      │ msg ────→ Returns True/False   │
│                      │ signature                       │
└──────────────────────┘         └──────────────────────┘
```

**Use Cases in QuantumShield**:
- User authentication: Challenge-response login
- Message integrity: Sign encrypted messages
- File authenticity: Sign file metadata and content

### 3. AES-256 (Symmetric Encryption)

**Overview**: AES-256 provides fast, practical encryption using keys derived from Kyber.

**Details**:
- **Mode**: Galois/Counter Mode (GCM) for authenticated encryption
- **Key Size**: 256 bits
- **IV Size**: 128 bits (random per encryption)
- **Tag Size**: 128 bits (authentication)

**Implementation**:
```javascript
// Pseudocode
const kyberSharedSecret = kyber.decaps(ciphertext, secretKey);
const aes256Key = HKDF(kyberSharedSecret, salt='', info='AES');
const iv = random(16);
const ciphertext = AES256_GCM.encrypt(plaintext, aes256Key, iv);
const tag = ciphertext.authTag;
// Send: {ciphertext, iv, tag, kyber_ct}
```

---

## Authentication Architecture

### Challenge-Response Login Mechanism

Instead of passwords, QuantumShield uses Falcon-based challenge-response authentication:

**Step 1: Client Registration**
```
User Input: username
↓
Generate Kyber Keypair (kyber_pk, kyber_sk)
Generate Falcon Keypair (falcon_pk, falcon_sk)
↓
Server: Store (username, kyber_pk, falcon_pk)
Client: Securely store kyber_sk, falcon_sk locally
↓
Success: User registered (no password needed)
```

**Step 2: Challenge Generation**
```
User Input: username
↓
Client: POST /api/auth/challenge {username}
↓
Server: 
  - Lookup user
  - Generate random 256-bit challenge
  - Return challenge to client
↓
Server: Store challenge temporarily (e.g., Redis with 5-min TTL)
```

**Step 3: Challenge Signing**
```
Client:
  - Receive challenge from server
  - Sign challenge: signature = Falcon.Sign(challenge, falcon_sk)
  - Return (username, challenge, signature) to server
```

**Step 4: Verification & Token Issuance**
```
Server:
  - Lookup user's falcon_pk
  - Verify: Falcon.Verify(challenge, signature, falcon_pk)
  - If valid:
    - Generate JWT: {user_id, exp: now+3600s}
    - Return JWT to client
  - If invalid:
    - Return 401 Unauthorized
↓
Client:
  - Store JWT in localStorage (or secure storage on mobile)
  - Use JWT for subsequent API requests
```

**Advantages**:
- ✅ No passwords to compromise
- ✅ Quantum-resistant (Falcon)
- ✅ Private keys never leave the device
- ✅ Each login uses a fresh challenge (prevents replay attacks)
- ✅ Can support biometrics (unlock local private key)

---

## Message Encryption Flow

### End-to-End Encryption for Chat

**Sender → Receiver**:

```
┌─────────────────────────────────────────────────────────────┐
│ Sender Side                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 1. Prepare Message                                           │
│    msg = "Hello, secure world"                              │
│                                                              │
│ 2. Fetch Receiver's Public Keys                             │
│    receiver_kyber_pk, receiver_falcon_pk (from DB/cache)    │
│                                                              │
│ 3. Establish Shared Secret (Kyber)                          │
│    (ct_kyber, shared_secret) = Kyber.Encaps(receiver_kyber_pk)
│    ct_kyber: 1,088 bytes                                    │
│    shared_secret: 32 bytes                                  │
│                                                              │
│ 4. Derive Symmetric Keys                                    │
│    aes_key = HKDF(shared_secret, salt, info='message')    │
│    hmac_key = HKDF(shared_secret, salt, info='hmac')      │
│                                                              │
│ 5. Encrypt Message                                          │
│    iv = random(16 bytes)                                    │
│    ct_msg = AES256_GCM.encrypt(msg, aes_key, iv)           │
│    tag = ct_msg.authTag                                    │
│                                                              │
│ 6. Sign with Falcon                                         │
│    signature = Falcon.Sign(ct_msg, sender_falcon_sk)        │
│                                                              │
│ 7. Prepare Payload                                          │
│    payload = {                                              │
│      sender_id: 123,                                        │
│      receiver_id: 456,                                      │
│      kyber_ct: ct_kyber,  // 1,088 bytes                   │
│      iv: iv,               // 16 bytes                      │
│      ciphertext: ct_msg,   // variable                      │
│      tag: tag,             // 16 bytes                      │
│      signature: signature, // ≤690 bytes                    │
│      timestamp: now()                                       │
│    }                                                        │
│                                                              │
│ 8. Send via Socket.IO                                       │
│    socket.emit('sendMessage', payload)                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                            ↓ Network
┌─────────────────────────────────────────────────────────────┐
│ Server Validation                                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 1. Verify Signature                                         │
│    sender_falcon_pk = DB.lookup(sender_id)                 │
│    assert Falcon.Verify(ct_msg, signature, sender_falcon_pk)
│                                                              │
│ 2. Server Signs (Optional - for non-repudiation)            │
│    server_signature = Falcon.Sign(ct_msg, server_falcon_sk) │
│                                                              │
│ 3. Store Encrypted Message                                  │
│    DB.insert({                                              │
│      sender_id, receiver_id, kyber_ct, iv, ciphertext,     │
│      signature, server_signature, timestamp                │
│    })                                                       │
│                                                              │
│ 4. Broadcast to Receiver (if online)                        │
│    socket.emit('receiveMessage', payload)                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                            ↓ Network
┌─────────────────────────────────────────────────────────────┐
│ Receiver Side                                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 1. Receive Payload                                          │
│    payload = event data                                    │
│                                                              │
│ 2. Verify Sender Signature                                  │
│    sender_falcon_pk = DB.lookup(sender_id)                 │
│    assert Falcon.Verify(ct_msg, signature, sender_falcon_pk)
│                                                              │
│ 3. Decapsulate Kyber                                        │
│    shared_secret = Kyber.Decaps(kyber_ct, receiver_kyber_sk)
│                                                              │
│ 4. Derive Keys                                              │
│    aes_key = HKDF(shared_secret, salt, info='message')    │
│                                                              │
│ 5. Decrypt Message                                          │
│    plaintext = AES256_GCM.decrypt(ct_msg, aes_key, iv, tag)
│                                                              │
│ 6. Display Message                                          │
│    chatUI.addMessage(sender, plaintext)                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## File Encryption & Transfer

### Secure File Upload

```
┌────────────────────────────────────────┐
│ Client (File Selection)                │
├────────────────────────────────────────┤
│                                         │
│ 1. User selects file                   │
│    file = readFile(path)               │
│    metadata = {name, size, mimeType}   │
│                                         │
│ 2. Encrypt file (similar to messages)  │
│    kyber_ct, shared_secret ←            │
│      Kyber.Encaps(receiver_kyber_pk)   │
│    aes_key ← HKDF(shared_secret)       │
│    iv ← random(16)                     │
│    file_ct ← AES256_GCM.encrypt(file)  │
│    file_sig ← Falcon.Sign(file_ct)     │
│                                         │
│ 3. Multipart Upload (for large files)  │
│    chunk[0] = file_ct[0:1MB]           │
│    chunk[1] = file_ct[1MB:2MB]         │
│    ...                                  │
│                                         │
│ 4. Send each chunk with metadata       │
│    POST /api/files/upload              │
│    FormData: {chunk, chunkIndex, ...}  │
│                                         │
└────────────────────────────────────────┘
```

### Server Storage

```
┌────────────────────────────────────────┐
│ Server (File Storage)                  │
├────────────────────────────────────────┤
│                                         │
│ 1. Validate Signature                  │
│    assert Falcon.Verify(...)           │
│                                         │
│ 2. Store encrypted file                │
│    /uploads/[file_id].[ext]            │
│                                         │
│ 3. Store metadata (encrypted)          │
│    metadata_encrypted = {              │
│      original_name: AES.enc(name),     │
│      size: original_size,              │
│      uploader_id: sender_id,           │
│      recipient_id: receiver_id,        │
│      kyber_ct: kyber_ct,               │
│      iv: iv,                           │
│      signature: signature,             │
│      upload_time: now(),               │
│      expiry_time: now() + 7days        │
│    }                                   │
│                                         │
│ 4. Return download link with token     │
│    /api/files/download/[file_id]       │
│    ?token=[short-lived-token]          │
│                                         │
└────────────────────────────────────────┘
```

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  
  -- Post-Quantum Cryptography Keys
  kyber_public_key TEXT NOT NULL,
  falcon_public_key TEXT NOT NULL,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  role TEXT DEFAULT 'user' -- 'user', 'admin'
);
```

### Messages Table
```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  
  -- Encryption Components
  kyber_ciphertext TEXT NOT NULL,      -- Encapsulated shared secret
  iv TEXT NOT NULL,                     -- AES-256 GCM IV
  encrypted_message TEXT NOT NULL,      -- Encrypted message content
  
  -- Authentication
  signature TEXT NOT NULL,              -- Falcon signature (sender)
  server_signature TEXT,                -- Optional: server counter-signature
  
  -- Metadata
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP,
  delivery_status TEXT DEFAULT 'sent'  -- 'sent', 'delivered', 'read'
  
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);

CREATE INDEX idx_receiver_unread ON messages(receiver_id, read_at);
CREATE INDEX idx_conversation ON messages(sender_id, receiver_id, timestamp);
```

### Files Table
```sql
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uploader_id INTEGER NOT NULL,
  recipient_id INTEGER,  -- NULL for group uploads
  
  -- File Storage
  file_hash TEXT UNIQUE NOT NULL,      -- SHA-256 of encrypted content
  encrypted_filename TEXT NOT NULL,    -- AES-encrypted original name
  file_size_original INTEGER,
  file_size_encrypted INTEGER,
  file_mime_type TEXT,
  
  -- Encryption Components
  kyber_ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  signature TEXT NOT NULL,              -- Falcon signature
  server_signature TEXT,
  
  -- Metadata
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,  -- For temporary sharing
  access_token TEXT,     -- Short-lived download token
  
  FOREIGN KEY (uploader_id) REFERENCES users(id),
  FOREIGN KEY (recipient_id) REFERENCES users(id)
);

CREATE INDEX idx_recipient_active ON files(recipient_id, expires_at);
```

### Sessions Table (Optional - for token management)
```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  jwt_token TEXT NOT NULL,
  challenge TEXT,  -- Falcon challenge used for auth
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_token_expiry ON sessions(jwt_token, expires_at);
```

---

## Security Best Practices

### 1. Key Management

**Storage**:
- ✅ Public keys: Database (non-secret)
- ✅ Server private keys: Environment variables / Hardware security module (HSM)
- ✅ Client private keys: Secure local storage (Keychain/Keystore/localStorage with encryption)

**Rotation**:
- ⚠️ Kyber keys: Per-message (ephemeral)
- ⚠️ Falcon keys: Annual rotation recommended
- ⚠️ Symmetric keys: Never stored; derived on-demand

### 2. Random Number Generation

- Use cryptographically secure RNG (e.g., `crypto.randomBytes()` in Node.js)
- Use native platform RNG on mobile (Android's `SecureRandom`, iOS's `SecRandomCopyBytes`)

### 3. Input Validation

```javascript
// Example: Validate incoming message
function validateMessage(payload) {
  if (!payload.sender_id || typeof payload.sender_id !== 'number') throw Error;
  if (!payload.receiver_id || typeof payload.receiver_id !== 'number') throw Error;
  if (!payload.kyber_ciphertext || payload.kyber_ciphertext.length !== 1088) throw Error;
  if (!payload.iv || payload.iv.length !== 16) throw Error;
  if (!payload.signature) throw Error;
  // ... validate other fields
}
```

### 4. Rate Limiting

```javascript
// Example: Rate limit authentication attempts
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per IP
  message: 'Too many login attempts, try again later'
});

app.post('/api/auth/challenge', authLimiter, (req, res) => { ... });
```

### 5. Error Handling

```javascript
// DON'T reveal cryptographic details in errors
❌ Error: "Invalid Falcon signature"

// DO provide generic errors
✅ Error: "Authentication failed"
```

---

## Performance Metrics

### Cryptographic Operation Timings (Approximate)

| Operation | Duration | Notes |
|-----------|----------|-------|
| Kyber.Keygen() | 100-500 µs | One-time at registration |
| Kyber.Encaps() | 100-300 µs | Per message |
| Kyber.Decaps() | 100-300 µs | Per message |
| Falcon.Keygen() | 100-200 µs | One-time at registration |
| Falcon.Sign() | 500-1000 µs | Per message |
| Falcon.Verify() | 300-600 µs | Per message |
| AES-256-GCM.encrypt() | 1-10 µs per byte | Depends on message size |
| AES-256-GCM.decrypt() | 1-10 µs per byte | Depends on ciphertext size |

**Optimization Strategies**:
1. Cache sender's public keys to avoid DB lookups
2. Pre-generate Kyber keypairs in background (Web Workers)
3. Use message batching for bulk operations
4. Implement connection pooling for database

---

## Compliance & Standards

### NIST Post-Quantum Cryptography

QuantumShield uses NIST-standardized algorithms:
- ✅ CRYSTALS-Kyber (Standardized 2022, FIPS 203 status: Approved)
- ✅ Falcon (Standardized 2022, FIPS 204 status: Approved)

### Data Protection Regulations

**Roadmap for Compliance**:
- [ ] GDPR: Implement data export, deletion, and privacy controls
- [ ] CCPA: Provide California Privacy Rights notices
- [ ] HIPAA: If storing health data, implement audit logs
- [ ] SOC 2: Undergo third-party security audit

### Cryptographic Audit

⚠️ **Required before production**:
1. Security code review by crypto experts
2. Formal security audit (e.g., Trail of Bits, Cure53)
3. Penetration testing
4. Hardware security module (HSM) evaluation for keys

---

## Implementation Roadmap

### Phase 1: MVP (Current)
- ✅ Project scaffolding
- ✅ Placeholder crypto functions
- ✅ Authentication flow design
- ✅ Database schema
- ⏳ Frontend UI (in progress)

### Phase 2: Crypto Integration
- ⏳ Integrate `node-liboqs` for actual Kyber/Falcon
- ⏳ Add AES-256-GCM for symmetric encryption
- ⏳ Implement secure key derivation (HKDF)
- ⏳ Add message/file encryption tests

### Phase 3: Production Hardening
- ⏳ Security audit
- ⏳ Rate limiting & DDoS protection
- ⏳ HSM integration for server keys
- ⏳ Comprehensive error handling
- ⏳ Logging & monitoring

### Phase 4: Advanced Features
- ⏳ Multi-recipient group messaging
- ⏳ Forward secrecy (per-message keys)
- ⏳ Key rotation & rekeying protocols
- ⏳ Offline message queuing
- ⏳ Voice/video encryption

---

## References

- [NIST PQC Standardization](https://csrc.nist.gov/projects/post-quantum-cryptography/standardized-algorithms)
- [Kyber Paper](https://pq-crystals.org/kyber/data/kyber-specification-round3-20210804.pdf)
- [Falcon Paper](https://falcon-sign.info/falcon.pdf)
- [node-liboqs](https://github.com/open-quantum-safe/liboqs-node)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

---

**Last Updated**: November 11, 2025  
**Status**: In Progress - Prototype Phase
