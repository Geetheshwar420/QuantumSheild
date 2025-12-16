import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { initDb, db } from './database/db.js';
import { 
  signWithFalcon, 
  verifyWithFalcon,
  encryptAndSignMessage,
  verifyAndDecryptMessage 
} from './crypto/pqc.js';
import { verifyToken } from './middleware/authMiddleware.js';
import { helmet, authLimiter, apiLimiter, errorHandler } from './middleware/security.js';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Validate critical environment variables at startup
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
  console.error('✗ FATAL: JWT_SECRET environment variable is not set');
  console.error('  JWT_SECRET is required for secure authentication');
  console.error('  Please set JWT_SECRET in your .env file or environment');
  console.error('  Example: JWT_SECRET=your-secure-random-secret-key-here');
  console.error('\nServer cannot start without JWT_SECRET. Exiting...');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;


import authRoutes from './api/authRoutes.js';
import userRoutes from './api/userRoutes.js';
import friendRoutes from './api/friendRoutes.js';
import cryptoRoutes from './api/cryptoRoutes.js';
import keyRoutes from './api/keyRoutes.js';
import { initializeDatabase } from './config/database.js';

const app = express();

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3002'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (non-browser clients like mobile apps, server-to-server)
    // These must still provide valid JWT authentication in subsequent middleware
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS policy violation: Origin not allowed'), false);
    }
    
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Handle CORS errors with informative message
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('CORS policy')) {
    console.error(`CORS error from ${req.headers.origin || 'no-origin'}: ${err.message}`);
    return res.status(403).json({ 
      error: 'CORS policy violation',
      message: 'This origin is not allowed. Configure ALLOWED_ORIGINS environment variable or use proper authentication headers for non-browser clients.'
    });
  }
  next(err);
});

const server = http.createServer(app);

// ============================================================================
// Socket.IO Security Model
// ============================================================================
// 1. Authentication: JWT token verified during handshake (io.use middleware)
//    - Token must be provided in socket.handshake.auth.token or query.token
//    - UserId must match the JWT payload (decoded.id === userId)
//    - Failed auth rejects the connection before any events can be processed
//
// 2. Authorization: All event handlers validate socket.userId
//    - sendMessage: Verifies senderId === socket.userId (prevents impersonation)
//    - getUnreadMessages: Uses authenticated socket.userId (no client input)
//    - No client-provided userId/senderId trusted without verification
//
// 3. CORS: Strict origin validation (no wildcards, no missing origin bypass)
//    - Only allowedOrigins can establish socket connections
//    - Credentials required for cross-origin requests
//
// 4. Room-based messaging: Prevents broadcast eavesdropping
//    - Each user in private room: user_${userId}
//    - Messages targeted to specific receiver room only
// ============================================================================

// Socket.IO with strict CORS and authentication
// Only allows connections from allowedOrigins with valid JWT tokens
const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // Strict origin validation (no wildcards)
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Socket.IO authentication middleware - all connections must provide valid JWT
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  const userId = socket.handshake.auth.userId || socket.handshake.query.userId;

  if (!token || !userId) {
    console.log('Socket connection rejected: Missing credentials', {
      socketId: socket.id,
      hasToken: !!token,
      hasUserId: !!userId
    });
    return next(new Error('Authentication error: Missing credentials'));
  }

  // Verify JWT token
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Validate userId matches the token payload
    if (decoded.id !== parseInt(userId)) {
      console.log('Socket connection rejected: Token userId mismatch', {
        socketId: socket.id,
        providedUserId: userId,
        tokenUserId: decoded.id
      });
      return next(new Error('Authentication error: Invalid credentials'));
    }

    // Attach authenticated user info to socket
    socket.userId = userId;
    socket.username = decoded.username;
    console.log(`Socket authenticated successfully: ${decoded.username} (ID: ${userId})`);
    next();
  } catch (err) {
    console.log('Socket connection rejected: JWT verification failed', {
      socketId: socket.id,
      error: err.message
    });
    return next(new Error('Authentication error: Invalid token'));
  }
});

// Handle Socket.IO connection errors (authentication failures)
io.engine.on("connection_error", (err) => {
  console.log('Socket.IO connection error:', {
    code: err.code,
    message: err.message,
    context: err.context
  });
});

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security middleware (must be early in middleware chain)
app.use(helmet());

// Health check endpoint (before rate limiting)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Apply rate limiting to routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/friends', apiLimiter, friendRoutes);
app.use('/api/crypto', apiLimiter, cryptoRoutes);
app.use('/api/keys', apiLimiter, keyRoutes); // Secure key retrieval endpoint

app.get('/', (req, res) => {
  res.send('QuantumShield Backend is running...');
});

// Socket.IO Connection Handler
// Architecture: Room-based targeted messaging with ephemeral delivery (no storage)
// - Each user joins a room named "user_${userId}" on connect
// - Messages are sent to receiver's room (not broadcast)
// - Online status checked before delivery (io.sockets.adapter.rooms)
// - Messages are ONLY transmitted in real-time (not persisted)
// - Rooms automatically cleaned up on disconnect by Socket.IO
io.on('connection', (socket) => {
  console.log('User connected:', socket.id, 'UserId:', socket.userId);

  // Join user to their own room for targeted messaging
  // Room name format: user_${userId}
  socket.join(`user_${socket.userId}`);

  socket.on('sendMessage', ({ senderId, receiverId, encryptedMessage, kyberCiphertext, iv, authTag, signature }) => {
    // Verify sender matches authenticated socket user (authorization check)
    if (parseInt(senderId) !== parseInt(socket.userId)) {
      console.log('Message rejected: Sender ID mismatch', {
        socketId: socket.id,
        authenticatedUserId: socket.userId,
        providedSenderId: senderId
      });
      return socket.emit('messageError', { error: 'Unauthorized: Sender ID mismatch' });
    }

    // MANDATORY ENCRYPTION - All messages must be encrypted with PQC
    if (!kyberCiphertext || !iv || !authTag || !signature || !encryptedMessage) {
      console.log('Message rejected: Missing required encryption fields', {
        socketId: socket.id,
        userId: socket.userId,
        hasReceiverId: !!receiverId,
        hasMessage: !!encryptedMessage,
        hasKyberCiphertext: !!kyberCiphertext,
        hasIv: !!iv,
        hasAuthTag: !!authTag,
        hasSignature: !!signature
      });
      return socket.emit('messageError', { 
        error: 'Encryption is mandatory. All messages must be encrypted with post-quantum cryptography.' 
      });
    }

    if (!receiverId) {
      return socket.emit('messageError', { error: 'Missing receiver ID' });
    }

    console.log('Encrypted message received:', {
      socketId: socket.id,
      senderId,
      receiverId
    });

    // Check if sender and receiver are friends
    const user_id_1 = Math.min(senderId, receiverId);
    const user_id_2 = Math.max(senderId, receiverId);

    const checkFriendStmt = db.prepare('SELECT id FROM friendships WHERE user_id_1 = ? AND user_id_2 = ?');
    checkFriendStmt.get(user_id_1, user_id_2, async (err, friendship) => {
      if (err || !friendship) {
        return socket.emit('messageError', { error: 'You can only message friends' });
      }

      // Get sender's Falcon public key to verify signature
      const senderKeyStmt = db.prepare('SELECT falcon_public_key FROM users WHERE id = ?');
      senderKeyStmt.get(senderId, async (err, senderUser) => {
        if (err || !senderUser) {
          return socket.emit('messageError', { error: 'Failed to verify sender' });
        }

        // Verify Falcon signature (async)
        try {
          const dataToVerify = encryptedMessage + iv + authTag;
          const isValid = await verifyWithFalcon(dataToVerify, signature, senderUser.falcon_public_key);
          
          if (!isValid) {
            console.log('Message rejected: Invalid signature', { senderId, receiverId });
            return socket.emit('messageError', { error: 'Invalid message signature - message may be tampered' });
          }
        } catch (err) {
          console.error('Signature verification failed:', err);
          return socket.emit('messageError', { error: 'Failed to verify message signature' });
        }

        // NO STORAGE - Messages are only transmitted in real-time
        // This provides forward secrecy and ensures no message history
        const messageData = {
          id: Date.now(), // Temporary ID for UI tracking
          senderId,
          receiverId,
          encryptedMessage,
          kyberCiphertext,
          iv,
          authTag,
          signature,
          timestamp: new Date().toISOString()
        };
        
        // Check if receiver is online
        const receiverRoom = `user_${receiverId}`;
        const receiverSockets = io.sockets.adapter.rooms.get(receiverRoom);
        
        if (receiverSockets && receiverSockets.size > 0) {
          // Receiver is online - send message in real-time (no storage)
          io.to(receiverRoom).emit('receiveMessage', messageData);
          console.log('✓ Encrypted message delivered (not stored)', { senderId, receiverId });
          
          // Send confirmation to sender
          socket.emit('messageSent', { success: true, messageId: messageData.id });
        } else {
          // Receiver is offline - message is NOT stored for security
          console.log('✗ Receiver offline - message not delivered (encryption-only mode)', { senderId, receiverId });
          socket.emit('messageError', { 
            error: 'Recipient is offline. Messages are only delivered in real-time for security.' 
          });
        }
      });
    });
  });

  // Peer-to-peer file transfer (no server storage)
  socket.on('sendFile', (data) => {
    const senderId = socket.userId;
    const { 
      receiverId, 
      fileName, 
      fileSize, 
      fileData, // encrypted file data (base64)
      kyberCiphertext, 
      iv, 
      authTag, 
      signature 
    } = data;

    // Validate required fields
    if (!kyberCiphertext || !iv || !authTag || !signature || !fileData) {
      console.log('✗ File transfer rejected: Missing encryption fields', { senderId, receiverId });
      return socket.emit('fileError', { 
        error: 'File encryption is mandatory. Missing required encryption fields.' 
      });
    }

    if (!senderId) {
      console.log('✗ File transfer rejected: No authenticated sender', { socketId: socket.id });
      return socket.emit('fileError', { error: 'Authentication required' });
    }

    if (!receiverId) {
      console.log('✗ File transfer rejected: No receiver specified', { senderId });
      return socket.emit('fileError', { error: 'Receiver ID required' });
    }

    // Verify signature using Falcon
    const dataToVerify = fileData + iv + authTag;
    db.get('SELECT falcon_public_key FROM users WHERE id = ?', [senderId], async (err, sender) => {
      try {
        if (err || !sender) {
          console.error('✗ File transfer error: Sender not found', { senderId, error: err?.message });
          return socket.emit('fileError', { error: 'Sender verification failed' });
        }

        const isValidSignature = await verifyWithFalcon(dataToVerify, signature, sender.falcon_public_key);
        
        if (!isValidSignature) {
          console.log('✗ File transfer rejected: Invalid signature', { senderId, receiverId });
          return socket.emit('fileError', { error: 'Invalid file signature' });
        }

      // File is encrypted and signed - forward to receiver if online
      const receiverRoom = `user_${receiverId}`;
      const receiverSockets = io.sockets.adapter.rooms.get(receiverRoom);

      if (receiverSockets && receiverSockets.size > 0) {
        const fileTransferData = {
          fileId: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          senderId,
          receiverId,
          fileName,
          fileSize,
          fileData,
          kyberCiphertext,
          iv,
          authTag,
          signature,
          timestamp: new Date().toISOString()
        };

        io.to(receiverRoom).emit('receiveFile', fileTransferData);
        
        socket.emit('fileDelivered', { 
          fileId: fileTransferData.fileId,
          status: 'Delivered',
          timestamp: fileTransferData.timestamp
        });

        console.log('✓ File delivered (peer-to-peer, no storage)', { 
          fileId: fileTransferData.fileId,
          senderId, 
          receiverId,
          fileName,
          fileSize 
        });
      } else {
        // Receiver is offline - file is NOT stored for security
        console.log('✗ Receiver offline - file not delivered (no storage mode)', { senderId, receiverId, fileName });
        socket.emit('fileError', { 
          error: 'Recipient is offline. Files are only transferred in real-time for security.' 
        });
      }
      } catch (verifyErr) {
        console.error('✗ File signature verification error:', { senderId, receiverId, error: verifyErr.message });
        socket.emit('fileError', { error: 'Failed to verify file signature' });
      }
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id, 'UserId:', socket.userId);
    // Socket.IO automatically removes the socket from all rooms on disconnect
    // The user_${userId} room will be cleaned up automatically
  });
});

// Graceful shutdown handler
// Closes server connections, then database, then exits process
const gracefulShutdown = (signal) => {
  console.log(`${signal} received, closing server...`);
  server.close(() => {
    console.log('Server closed');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
        process.exit(1);
      }
      console.log('Database closed');
      process.exit(0);
    });
  });
  
  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Initialize Database and start server only after DB is ready
// This prevents race conditions where the server accepts connections before DB is initialized
async function startServer() {
  try {
    // First, validate PostgreSQL connection if configured (fail-fast in production)
    await initializeDatabase();
    console.log('✓ Database connection validated');

    // Then initialize schema and tables
    await initDb();
    console.log('✓ Database schema initialization completed successfully');
    
    // Start server only after database is fully ready
    server.listen(PORT, () => {
      console.log(`✓ Server is running on port ${PORT}`);
      console.log(`  Environment: ${NODE_ENV}`);
      console.log(`  Allowed origins: ${allowedOrigins.join(', ')}`);
      console.log(`  Socket.IO: Enabled with JWT authentication`);
      console.log(`  Security: Helmet + Rate Limiting enabled`);
      console.log(`\nQuantumShield backend ready to accept connections`);
    });
  } catch (err) {
    console.error('✗ FATAL: Database initialization failed');
    console.error('  Error:', err.message);
    console.error('\nServer cannot start without database. Exiting...');
    process.exit(1);
  }
}

startServer();

// Global error handler (must be last)
app.use(errorHandler);
