import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// ============================================================================
// SSL Certificate Validation Configuration
// ============================================================================
// SECURITY: Always validates SSL certificates in production.
// In development, self-signed certs can be allowed via DB_SSL_REJECT_UNAUTHORIZED=false
// To disable validation (development only):
//   1. Set NODE_ENV !== 'production' (required for safety)
//   2. Set DB_SSL_REJECT_UNAUTHORIZED=false in .env
// NEVER disable SSL validation in production - ensures encrypted secure connections
// ============================================================================
const getSslConfig = () => {
  // Production: Always validate SSL (enforced, cannot be disabled)
  if (isProduction) {
    return {
      require: true,
      rejectUnauthorized: true
    };
  }
  
  // Development: Allow opt-in to disable validation (for self-signed certs)
  const allowDisableValidation = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false';
  return {
    require: true,
    rejectUnauthorized: !allowDisableValidation // Default: true (validate), unless explicitly disabled
  };
};

// Database configuration based on environment
const getDatabaseConfig = () => {
  // Production: Require DATABASE_URL (fail fast)
  if (isProduction) {
    if (!process.env.DATABASE_URL) {
      const error = new Error(
        'FATAL: DATABASE_URL environment variable is not set in production mode. ' +
        'PostgreSQL connection string is required for production deployment. ' +
        'Please set DATABASE_URL in your .env or environment variables.'
      );
      throw error;
    }
    // Production: PostgreSQL (Neon, Supabase, etc.)
    return new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      protocol: 'postgres',
      dialectOptions: {
        ssl: getSslConfig()
      },
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });
  } else {
    // Development/Fallback: SQLite (always available)
    return new Sequelize({
      dialect: 'sqlite',
      storage: process.env.SQLITE_PATH || './database.sqlite',
      logging: false
    });
  }
};

const sequelize = getDatabaseConfig();

// ============================================================================
// Database Connection Initialization
// ============================================================================
// Validates database connection with proper error handling:
// - Production PostgreSQL: Fails fast (exits process) on connection error
// - Development SQLite: Validates availability, logs warnings on failure
// - Guarantees: Always returns a valid Sequelize instance (never null)
// IMPORTANT: Must be called and awaited from server.js before starting server
// ============================================================================
export const initializeDatabase = async () => {
  try {
    await sequelize.authenticate();
    
    if (isProduction) {
      console.log('✅ PostgreSQL Database connected successfully');
    } else {
      console.log('✅ SQLite Database connection validated');
    }
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    
    if (isProduction) {
      // Production: Fail fast - database must be available
      console.error('FATAL: Cannot start server without database in production.');
      console.error('Ensure DATABASE_URL is set and the database is accessible.');
      process.exit(1);
    } else {
      // Development: Terminate process on DB validation failure
      console.error('❌ FATAL: Database validation failed in development.');
      console.error('   Check SQLite availability and file permissions.');
      process.exit(1);
    }  }
};

export { sequelize };
