const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const kyber = require('./lib/kyber');
const falcon = require('falcon-crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Store user public keys and sessions
const users = new Map();

// Simulated Kyber functions
const generateKyberKeyPair = () => {
  return {
    publicKey: 'PUBLIC_KEY_SIMULATED',
    secretKey: 'SECRET_KEY_SIMULATED'
  };
};

// Simulated Falcon functions
const generateFalconKeyPair = async () => {
  return {
    publicKey: 'FALCON_PUBLIC_SIMULATED',
    secretKey: 'FALCON_SECRET_SIMULATED'
  };
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user registration
  socket.on('register', async (username) => {
    try {
      const kyberKeys = generateKyberKeyPair();
      const falconKeys = await generateFalconKeyPair();
      
      users.set(username, {
        socketId: socket.id,
        kyberPublic: kyberKeys.publicKey,
        falconPublic: falconKeys.publicKey
      });
      
      socket.emit('registered', {
        kyberSecret: kyberKeys.secretKey,
        falconSecret: falconKeys.secretKey
      });
    } catch (error) {
      console.error('Registration error:', error);
      socket.emit('error', 'Registration failed');
    }
  });

  // Handle message encryption and delivery
  socket.on('sendMessage', async ({ sender, recipient, encryptedMessage, signature }) => {
    try {
      const recipientData = users.get(recipient);
      if (!recipientData) {
        socket.emit('error', 'Recipient not found');
        return;
      }
      
      // Verify signature
      const isValid = await falcon.verify(
        encryptedMessage,
        signature,
        users.get(sender).falconPublic
      );
      
      if (!isValid) {
        socket.emit('error', 'Invalid signature');
        return;
      }
      
      // Forward message to recipient
      socket.to(recipientData.socketId).emit('receiveMessage', {
        sender,
        encryptedMessage,
        signature
      });
    } catch (error) {
      console.error('Message send error:', error);
      socket.emit('error', 'Message delivery failed');
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
