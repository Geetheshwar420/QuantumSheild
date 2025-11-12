    const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./quantumshield.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the QuantumShield database.');
});

const initDb = () => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      kyber_public_key TEXT NOT NULL,
      falcon_public_key TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Attempt to add password_hash column for password-based auth (ignore error if it already exists)
    db.run('ALTER TABLE users ADD COLUMN password_hash TEXT', (err) => {
      if (err && !/duplicate column name/i.test(err.message)) {
        console.warn('Warning adding password_hash column to users table:', err.message);
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME,
      FOREIGN KEY (sender_id) REFERENCES users (id),
      FOREIGN KEY (receiver_id) REFERENCES users (id),
      UNIQUE(sender_id, receiver_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id_1 INTEGER NOT NULL,
      user_id_2 INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id_1) REFERENCES users (id),
      FOREIGN KEY (user_id_2) REFERENCES users (id),
      UNIQUE(user_id_1, user_id_2)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      kyber_ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      encrypted_message TEXT NOT NULL,
      signature TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME,
      FOREIGN KEY (sender_id) REFERENCES users (id),
      FOREIGN KEY (receiver_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uploader_id INTEGER NOT NULL,
      receiver_id INTEGER,
      filename TEXT,
      encrypted_metadata TEXT,
      kyber_ciphertext TEXT,
      iv TEXT,
      signature TEXT,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploader_id) REFERENCES users (id),
      FOREIGN KEY (receiver_id) REFERENCES users (id)
    )`);

    // Create indexes for performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON friendships(user_id_1)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON friendships(user_id_2)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`);
  });
};

module.exports = { db, initDb };
