import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import pkg from 'pg';
const { Pool } = pkg;
dotenv.config();

// Decide DB based on env: use PostgreSQL (Neon) when DATABASE_URL is set, else SQLite
const usePostgres = !!process.env.DATABASE_URL;

let db; // unified db interface
let pool; // pg pool when using Postgres

if (usePostgres) {
  // Initialize PostgreSQL pool with free-tier optimized settings
  // Production: Always validates SSL certificates (enforced)
  // Development: Can opt-out via DB_SSL_REJECT_UNAUTHORIZED=false
  const isProduction = process.env.NODE_ENV === 'production';
  const allowDisableValidation = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false';
  
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: isProduction ? true : !allowDisableValidation
    },
    // Optimized for free-tier databases (Neon, Supabase, etc.)
    max: 10, // Reduced from potential defaults, suitable for small-scale deployment
    min: 2, // Keep 2 connections warm to reduce cold-start latency
    idleTimeoutMillis: 30000, // Close idle connections after 30s (free tier limit)
    connectionTimeoutMillis: 10000, // 10s to establish connection
    allowExitOnIdle: true, // Allow pool to clean up when idle (important for free tier)
  });
  
  // Graceful shutdown handler
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing database pool...');
    await pool.end();
    console.log('Database pool closed');
  });
  
  // Helper to convert ? placeholders to $1, $2, etc.
  const convertPlaceholders = (text) => {
    let index = 0;
    return text.replace(/\?/g, () => `$${++index}`);
  };
  
  db = {
    // Direct methods (sqlite3 API compatibility, supports both callback and promise)
    get: (text, params, cb) => {
      // Detect if last arg is a callback function
      if (typeof cb === 'function') {
        // Callback style
        pool.query(convertPlaceholders(text), params)
          .then((res) => cb(null, res.rows[0]))
          .catch((err) => cb(err));
      } else {
        // Promise style
        return pool.query(convertPlaceholders(text), params)
          .then((res) => res.rows[0])
          .catch((err) => { throw err; });
      }
    },
    
    run: (text, params, cb) => {
      // Detect if last arg is a callback function
      if (typeof cb === 'function') {
        // Callback style
        pool.query(convertPlaceholders(text), params)
          .then((res) => cb(null, res))
          .catch((err) => cb(err));
      } else {
        // Promise style - cb might be undefined or a param
        return pool.query(convertPlaceholders(text), params)
          .then((res) => res)
          .catch((err) => { throw err; });
      }
    },
    
    all: (text, params, cb) => {
      // Detect if last arg is a callback function
      if (typeof cb === 'function') {
        // Callback style
        pool.query(convertPlaceholders(text), params)
          .then((res) => cb(null, res.rows))
          .catch((err) => cb(err));
      } else {
        // Promise style - cb might be undefined or a param
        return pool.query(convertPlaceholders(text), params)
          .then((res) => res.rows)
          .catch((err) => { throw err; });
      }
    },
    
    // prepare() method for prepared statement pattern
    prepare: (text) => ({
      run: (...args) => {
        const lastArg = args[args.length - 1];
        const isCallback = typeof lastArg === 'function';
        const cb = isCallback ? lastArg : undefined;
        const params = isCallback ? args.slice(0, -1) : args;
        
        const promise = pool.query(convertPlaceholders(text), params)
          .then((res) => res)
          .catch((err) => { throw err; });
        
        if (cb) {
          // Callback style
          promise
            .then((res) => cb(null, res))
            .catch((err) => cb(err));
        } else {
          // Promise style
          return promise;
        }
      },
      
      get: (...args) => {
        const lastArg = args[args.length - 1];
        const isCallback = typeof lastArg === 'function';
        const cb = isCallback ? lastArg : undefined;
        const params = isCallback ? args.slice(0, -1) : args;
        
        const promise = pool.query(convertPlaceholders(text), params)
          .then((res) => res.rows[0])
          .catch((err) => { throw err; });
        
        if (cb) {
          // Callback style
          promise
            .then((row) => cb(null, row))
            .catch((err) => cb(err));
        } else {
          // Promise style
          return promise;
        }
      },
      
      all: (...args) => {
        const lastArg = args[args.length - 1];
        const isCallback = typeof lastArg === 'function';
        const cb = isCallback ? lastArg : undefined;
        const params = isCallback ? args.slice(0, -1) : args;
        
        const promise = pool.query(convertPlaceholders(text), params)
          .then((res) => res.rows)
          .catch((err) => { throw err; });
        
        if (cb) {
          // Callback style
          promise
            .then((rows) => cb(null, rows))
            .catch((err) => cb(err));
        } else {
          // Promise style
          return promise;
        }
      }
    })
  };
  console.log('Connected to PostgreSQL (Neon) database.');
} else {
  const { verbose } = sqlite3;
  db = new (verbose()).Database('./quantumshield.db', (err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Connected to the local SQLite QuantumShield database.');
  });
}

const initDb = () => {
  return new Promise((resolve, reject) => {
    if (usePostgres) {
      // Create tables first, then indexes (sequential to avoid missing table errors)
      const tableQueries = [
        `CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          kyber_public_key TEXT NOT NULL,
          falcon_public_key TEXT NOT NULL,
          kyber_secret_key TEXT NOT NULL,
          falcon_secret_key TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS friend_requests (
          id SERIAL PRIMARY KEY,
          sender_id INTEGER NOT NULL REFERENCES users(id),
          receiver_id INTEGER NOT NULL REFERENCES users(id),
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          responded_at TIMESTAMPTZ,
          CONSTRAINT unique_request UNIQUE(sender_id, receiver_id)
        );`,
        `CREATE TABLE IF NOT EXISTS friendships (
          id SERIAL PRIMARY KEY,
          user_id_1 INTEGER NOT NULL REFERENCES users(id),
          user_id_2 INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT unique_friendship UNIQUE(user_id_1, user_id_2)
        );`
      ];

      const indexQueries = [
        `CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id);`,
        `CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id);`,
        `CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON friendships(user_id_1);`,
        `CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON friendships(user_id_2);`
      ];

      (async () => {
        try {
          for (const q of tableQueries) {
            await pool.query(q);
          }
          for (const q of indexQueries) {
            await pool.query(q);
          }
          console.log('PostgreSQL tables and indexes initialized successfully');
          resolve();
        } catch (err) {
          console.error('Error initializing PostgreSQL schema:', err.message);
          reject(err);
        }
      })();
    } else {
      const errors = [];
      db.serialize(() => {
        // Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          kyber_public_key TEXT NOT NULL,
          falcon_public_key TEXT NOT NULL,
          kyber_secret_key TEXT NOT NULL,
          falcon_secret_key TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) { errors.push({ table: 'users', error: err.message }); }
        });

        // Friend requests
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
        )`, (err) => {
          if (err) { errors.push({ table: 'friend_requests', error: err.message }); }
        });

        // Friendships
        db.run(`CREATE TABLE IF NOT EXISTS friendships (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id_1 INTEGER NOT NULL,
          user_id_2 INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id_1) REFERENCES users (id),
          FOREIGN KEY (user_id_2) REFERENCES users (id),
          UNIQUE(user_id_1, user_id_2)
        )`, (err) => {
          if (err) { errors.push({ table: 'friendships', error: err.message }); }
        });

        // Indexes - capture errors for all four index creation calls
        db.run(`CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id)`, (err) => {
          if (err) { errors.push({ type: 'index', sql: 'idx_friend_requests_receiver', error: err.message }); }
        });
        db.run(`CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id)`, (err) => {
          if (err) { errors.push({ type: 'index', sql: 'idx_friend_requests_sender', error: err.message }); }
        });
        db.run(`CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON friendships(user_id_1)`, (err) => {
          if (err) { errors.push({ type: 'index', sql: 'idx_friendships_user1', error: err.message }); }
        });
        db.run(`CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON friendships(user_id_2)`, (err) => {
          if (err) { errors.push({ type: 'index', sql: 'idx_friendships_user2', error: err.message }); }
          
          // Final callback: check all errors (tables + indexes) after last index creation completes
          if (errors.length > 0) {
            const errorSummary = errors.map(e => {
              if (e.type === 'index') {
                return `Index ${e.sql}: ${e.error}`;
              } else {
                return `Table ${e.table}: ${e.error}`;
              }
            }).join('; ');
            reject(new Error(`Database initialization failed: ${errorSummary}`));
          } else {
            console.log('SQLite tables and indexes initialized successfully');
            resolve();
          }
        });
      });
    }
  });
};

export { db, initDb };
