    const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { initDb, db } = require('./database/db');
const { signWithFalcon } = require('./crypto/pqc');
const { verifyToken } = require('./middleware/authMiddleware');

const authRoutes = require('./api/authRoutes');
const messageRoutes = require('./api/messageRoutes');
const fileRoutes = require('./api/fileRoutes');
const friendRoutes = require('./api/friendRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Database
initDb();

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/files', fileRoutes);

app.get('/', (req, res) => {
  res.send('QuantumShield Backend is running...');
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('sendMessage', ({ senderId, receiverId, encryptedMessage, clientSignature }) => {
    // Check if sender and receiver are friends
    const user_id_1 = Math.min(senderId, receiverId);
    const user_id_2 = Math.max(senderId, receiverId);

    const checkFriendStmt = db.prepare('SELECT id FROM friendships WHERE user_id_1 = ? AND user_id_2 = ?');
    checkFriendStmt.get(user_id_1, user_id_2, (err, friendship) => {
      if (err || !friendship) {
        return socket.emit('messageError', { error: 'You can only message friends' });
      }

      // Proceed with message storage
    const serverSignature = signWithFalcon(encryptedMessage, 'placeholder_secret_key');

    // Placeholder PQC fields until real Kyber/AES implemented
    const placeholderKyber = 'kyber_placeholder_ct';
    const placeholderIv = 'iv_placeholder';

    const stmt = db.prepare('INSERT INTO messages (sender_id, receiver_id, kyber_ciphertext, iv, encrypted_message, signature) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(senderId, receiverId, placeholderKyber, placeholderIv, encryptedMessage, serverSignature, function(err) {
          if (err) {
              console.error('DB Error:', err);
              return socket.emit('messageError', { error: 'Failed to send message' });
          }
          // Broadcast the message to the receiver
          socket.broadcast.emit('receiveMessage', {
              id: this.lastID,
              senderId,
              receiverId,
              encryptedMessage,
              signature: serverSignature,
              timestamp: new Date().toISOString()
          });
      });
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
