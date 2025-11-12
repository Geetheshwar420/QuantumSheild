# QuantumShield: Post-Quantum Secure Chat & File Transfer Application

## Overview

**QuantumShield** is a full-stack, cross-platform application implementing post-quantum cryptography (PQC) to enable secure messaging, encrypted file sharing, and passwordless authentication. The system uses **CRYSTALS-Kyber** for key exchange and encryption, and **Falcon** for digital signatures and identity verification.

The application comprises:
- **Backend**: Node.js/Express server with WebSocket support (Socket.IO)
- **Web Frontend**: React application with Tailwind CSS and Framer Motion
- **Mobile Frontend**: Flutter app for iOS and Android
- **Database**: SQLite with encryption-at-rest

---

## Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                      QuantumShield Application                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────┐   │
│  │   React Web UI   │    │  Flutter Mobile  │    │  APIs  │   │
│  │   (Dashboard)    │    │   (iOS/Android)  │    │        │   │
│  └────────┬─────────┘    └────────┬─────────┘    └────┬───┘   │
│           │                       │                  │         │
│           └───────────────┬───────┴──────────────────┘         │
│                           │                                     │
│                    WebSocket & REST APIs                        │
│                           │                                     │
│           ┌───────────────▼───────────────────┐                │
│           │   Node.js/Express Backend         │                │
│           │   ┌─────────────────────────────┐ │                │
│           │   │ Cryptography Layer          │ │                │
│           │   │ - Kyber (Key Exchange)      │ │                │
│           │   │ - Falcon (Signatures)       │ │                │
│           │   │ - AES-256 (Symmetric)       │ │                │
│           │   └─────────────────────────────┘ │                │
│           │   ┌─────────────────────────────┐ │                │
│           │   │ API Layer                   │ │                │
│           │   │ - Auth (Challenge-Response) │ │                │
│           │   │ - Messaging                 │ │                │
│           │   │ - File Exchange             │ │                │
│           │   └─────────────────────────────┘ │                │
│           └───────────────┬───────────────────┘                │
│                           │                                     │
│           ┌───────────────▼───────────────────┐                │
│           │   SQLite Database                 │                │
│           │   - Users (with public keys)      │                │
│           │   - Encrypted Messages            │                │
│           │   - File Metadata                 │                │
│           └───────────────────────────────────┘                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### 1. Secure Messaging Module
- **Real-time encrypted chat** using Socket.IO WebSockets
- **Kyber key exchange** for establishing shared symmetric session keys
- **Falcon signatures** for verifying sender authenticity and message integrity
- **End-to-end encryption** with no plaintext stored in the database
- **Timestamps, delivery status, and read receipts**
- **Cross-platform sync** between web and mobile

### 2. Secure File Exchange Module
- **AES-256 encrypted file transfer** using Kyber-derived keys
- **Falcon signatures** for file integrity verification
- **Progress tracking and verification** on both web and mobile UIs
- **Support for multiple file formats** with size limits
- **Temporary encrypted download URLs** with expiration
- **Encrypted metadata storage**

### 3. Identity & Access Management (IAM) Module
- **Passwordless authentication** using Falcon digital signatures
- **Challenge-response login mechanism** (no passwords stored)
- **Automatic Kyber and Falcon key pair generation** at registration
- **Signature-based access validation** with JWT session tokens
- **Role-based permissions** (admin, user)
- **Integrated with all frontends** (React and Flutter)

---

## Cryptographic Strategy

### CRYSTALS-Kyber (Key Encapsulation Mechanism)
**Purpose**: Quantum-resistant key exchange for establishing shared symmetric session keys

**Implementation**:
- Generates secure shared secrets between communicating parties
- Used to derive AES-256 session keys for message and file encryption
- Provides protection against quantum computing threats

**Current Implementation**: Placeholder functions in `backend/src/crypto/pqc.js`  
**TODO**: Integrate `node-liboqs` library for actual Kyber operations

### Falcon (Digital Signature Scheme)
**Purpose**: Post-quantum digital signatures for authentication and integrity

**Implementation**:
- Signs challenges during login for passwordless authentication
- Signs messages to verify sender identity
- Signs file metadata to ensure integrity
- Supports role-based authorization

**Current Implementation**: Placeholder functions in `backend/src/crypto/pqc.js`  
**TODO**: Integrate `node-liboqs` library for actual Falcon operations

### AES-256 (Symmetric Encryption)
**Purpose**: Fast encryption of messages and files using Kyber-derived keys

**Usage**:
- Encrypts message content before storage
- Encrypts file contents before upload
- Uses random IVs for each encryption operation

---

## Project Structure

```
QuantumSheild/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── authRoutes.js          (Registration & Challenge-Response Login)
│   │   │   ├── messageRoutes.js       (Message endpoints)
│   │   │   └── fileRoutes.js          (File upload/download endpoints)
│   │   ├── crypto/
│   │   │   └── pqc.js                 (Kyber & Falcon implementations)
│   │   ├── database/
│   │   │   └── db.js                  (SQLite initialization & schema)
│   │   ├── middleware/                (Auth & validation middleware)
│   │   ├── services/                  (Business logic layer)
│   │   └── server.js                  (Express app & Socket.IO setup)
│   ├── package.json
│   └── quantumshield.db              (SQLite database file)
│
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.js           (Falcon-based login UI)
│   │   │   ├── RegisterPage.js        (User registration)
│   │   │   └── ChatDashboard.js       (Main chat interface)
│   │   ├── components/                (Reusable UI components)
│   │   ├── App.js                     (Main React app)
│   │   ├── App.css
│   │   └── index.js
│   └── package.json
│
├── mobile/
│   ├── lib/
│   │   ├── screens/
│   │   │   ├── login_screen.dart      (Flutter login)
│   │   │   └── register_screen.dart   (Flutter registration)
│   │   └── main.dart                  (Flutter app entry)
│   └── pubspec.yaml
│
└── README.md                           (This file)
```

---

## Setup Instructions

### Prerequisites
- **Node.js** (v16+) and npm
- **React** (v18+)
- **Flutter** SDK (for mobile development)
- **SQLite** (included with backend)

### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the backend server**:
   ```bash
   npm start
   ```
   The server will run on `http://localhost:3001` by default.

### Frontend (React) Setup

1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the React development server**:
   ```bash
   npm start
   ```
   The app will open at `http://localhost:3000`.

### Mobile (Flutter) Setup

1. **Navigate to mobile directory**:
   ```bash
   cd mobile
   ```

2. **Get Flutter dependencies**:
   ```bash
   flutter pub get
   ```

3. **Run the app**:
   ```bash
   flutter run
   ```

---

## API Endpoints

### Authentication
- **POST** `/api/auth/register` - Register a new user
  - Body: `{ username: string }`
  - Returns: User ID, public keys (Kyber & Falcon)

- **POST** `/api/auth/challenge` - Get a challenge for login
  - Body: `{ username: string }`
  - Returns: Random challenge string

- **POST** `/api/auth/login` - Login with Falcon signature
  - Body: `{ username: string, challenge: string, signature: string }`
  - Returns: JWT token

### Messaging (WebSocket)
- **sendMessage** - Emit encrypted message
- **receiveMessage** - Listen for incoming messages

### Messaging (REST)
- **GET** `/api/messages` - Retrieve messages (paginated)
- **POST** `/api/messages` - Send a message

### File Transfer
- **POST** `/api/files/upload` - Upload encrypted file
- **GET** `/api/files/download/:id` - Download encrypted file

---

## Workflow Examples

### User Registration
1. User enters username on Registration page
2. Frontend sends POST request to `/api/auth/register`
3. Backend generates Kyber and Falcon key pairs
4. Backend stores user with public keys in database
5. Backend returns public and secret keys to client
6. Client stores keys securely in localStorage (or secure storage on mobile)

### Passwordless Login
1. User enters username on Login page
2. Frontend requests challenge via `/api/auth/challenge`
3. Backend generates and returns random challenge
4. Client signs challenge using stored Falcon secret key
5. Frontend sends username, challenge, and signature to `/api/auth/login`
6. Backend verifies signature using stored public key
7. Backend issues JWT token valid for 1 hour
8. Client stores token and redirects to chat dashboard

### Message Encryption & Sending
1. User types message in chat interface
2. Client encrypts message using:
   - Recipient's Kyber public key → derives shared secret
   - Shared secret → derives AES-256 key
   - AES-256 → encrypts message content
3. Client signs encrypted message with Falcon secret key
4. Client emits `sendMessage` event via Socket.IO
5. Backend verifies signature using sender's public key
6. Backend signs message again with its Falcon key
7. Backend stores encrypted message in database
8. Backend broadcasts encrypted message to recipient via Socket.IO
9. Recipient receives and decrypts using shared AES-256 key

### File Upload & Encryption
1. User selects file from file picker
2. Frontend reads file content
3. Frontend encrypts file using:
   - Recipient's Kyber public key → derives shared secret
   - Shared secret → derives AES-256 key
   - AES-256 → encrypts file
4. Frontend signs file with Falcon secret key
5. Frontend uploads encrypted file and metadata to `/api/files/upload`
6. Backend verifies signature
7. Backend stores file and encrypted metadata
8. Backend returns file ID and download URL

---

## Security Considerations

### Current Implementation (Placeholder)
The current implementation uses placeholder Kyber and Falcon functions for demonstration. **DO NOT use in production**.

### Transition to Production

1. **Install node-liboqs**:
   ```bash
   npm install node-liboqs
   ```

2. **Replace placeholder functions** in `backend/src/crypto/pqc.js`:
   ```javascript
   const oqs = require('node-liboqs');

   const generateKyberKeys = () => {
     const keygen = new oqs.KeyEncapsulation('Kyber768');
     const publicKey = keygen.generate_keypair();
     const secretKey = keygen.export_secret_key();
     return { publicKey, secretKey };
   };

   const signWithFalcon = (data, secretKey) => {
     const signer = new oqs.Signature('Falcon-512');
     return signer.sign(data, secretKey);
   };

   // ... similar for other functions
   ```

3. **Enable database encryption**:
   - Use SQLite extension for encryption-at-rest
   - Implement key derivation for database keys

4. **Implement secure key storage**:
   - Use platform-specific secure storage (Keychain on iOS, Keystore on Android)
   - Use Web Crypto API for browser-based key management

5. **Add TLS/HTTPS**:
   - Use SSL certificates for backend
   - Ensure all communications are encrypted in transit

6. **Implement rate limiting and DoS protection**:
   - Add rate limiting middleware
   - Implement challenge-response validation

7. **Add comprehensive logging and monitoring**:
   - Log authentication events
   - Monitor for suspicious activity

---

## Testing

### Backend Testing
```bash
cd backend
npm test
```

### Frontend Testing
```bash
cd frontend
npm test
```

### Mobile Testing
```bash
cd mobile
flutter test
```

---

## Performance Optimization

1. **Message Pagination**: Load messages in batches
2. **File Chunking**: Upload/download large files in chunks with progress tracking
3. **Caching**: Implement Redis for session caching
4. **Database Indexing**: Index frequently queried fields
5. **Lazy Loading**: Load UI components on demand

---

## Future Enhancements

### Hybrid Cryptography (Optional)
- Support classical RSA/ECC alongside Kyber/Falcon
- Gradual migration path for legacy systems

### Advanced Features
- Group chat with multi-recipient encryption
- Voice/video call support
- End-to-end session key regeneration per conversation
- Offline message queuing with eventual consistency
- Biometric login integration (Face ID / Fingerprint)

### Additional PQC Algorithms
- Support for **Dilithium** (alternative signature scheme)
- Support for **SPHINCS+** (hash-based signatures)
- Support for **Kyber512** and **Kyber1024** variants

---

## Troubleshooting

### Backend won't start
- Ensure Node.js v16+ is installed: `node --version`
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check if port 3001 is available: `lsof -i :3001`

### React app won't connect to backend
- Ensure backend is running on `http://localhost:3001`
- Check CORS settings in `backend/src/server.js`
- Check browser console for errors

### Flutter app build fails
- Run `flutter clean` and `flutter pub get`
- Ensure Flutter SDK is properly installed: `flutter doctor`

---

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Implement changes with tests
3. Submit pull request with clear description

---

## License

MIT License - See LICENSE file for details

---

## Support

For issues, questions, or contributions, please open an issue or contact the development team.

---

## Disclaimer

⚠️ **This is a prototype implementation for educational and demonstration purposes.**

- Placeholder cryptographic functions are used for demonstration
- DO NOT use in production without proper PQC library integration
- Security audit and penetration testing required before production deployment
- Compliance with data protection regulations (GDPR, CCPA, etc.) must be ensured

---

## References

- [CRYSTALS-Kyber Specification](https://pq-crystals.org/kyber/)
- [Falcon Specification](https://falcon-sign.info/)
- [NIST Post-Quantum Cryptography Standardization](https://csrc.nist.gov/projects/post-quantum-cryptography/)
- [node-liboqs Documentation](https://github.com/open-quantum-safe/liboqs-node)
- [Socket.IO Documentation](https://socket.io/docs/)
- [React Documentation](https://react.dev/)
- [Flutter Documentation](https://flutter.dev/docs/)

---

**Last Updated**: November 11, 2025  
**Version**: 1.0.0
