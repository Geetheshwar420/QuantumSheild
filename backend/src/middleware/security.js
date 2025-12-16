import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { fileTypeFromBuffer } from 'file-type';
import fs from 'fs/promises';
import path from 'path';
import winston from 'winston';

// ============================================================================
// Structured Logger Configuration with Production Safety
// ============================================================================
const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'warn' : 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: !isProduction }), // Hide stack traces in production
    winston.format.json()
  ),
  defaultMeta: { service: 'quantumshield-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          // Sanitize metadata in production (remove sensitive info)
          if (isProduction) {
            const { stack, ...safeMeta } = meta;
            const metaStr = Object.keys(safeMeta).length ? JSON.stringify(safeMeta) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          }
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      )
    })
  ]
});

/**
 * Safe error logger - sanitizes errors for production
 */
const logError = (context, error, metadata = {}) => {
  if (isProduction) {
    // Only log error message, code, and safe metadata
    logger.error(context, {
      errorMessage: error.message,
      errorCode: error.code,
      ...metadata
    });
  } else {
    // Development: log full error
    logger.error(context, {
      error: error.message,
      stack: error.stack,
      ...metadata
    });
  }
};

// Expose logger for use in other modules
export { logger, logError };

// Rate limiting for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for general API endpoints
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// File upload validation middleware
// Validates file MIME type (declared vs actual), size, filename safety, and cleans up on rejection
export const validateFileUpload = async (req, res, next) => {
  try {
    // If no files, proceed
    if (!req.file && !req.files) {
      return next();
    }

    const allowedMimes = [
      'image/jpeg', 
      'image/png', 
      'image/gif', 
      'image/webp',
      'application/pdf',
      'text/plain'
    ];
    const maxSize = 10 * 1024 * 1024; // 10MB per file

    // Handle both single file (req.file) and multiple files (req.files)
    const files = req.files ? Object.values(req.files).flat() : [req.file];

    // Track all files being validated for cleanup on failure
    const validatedFiles = [];

    // Helper to clean up all validated files
    const cleanupValidatedFiles = async () => {
      for (const validatedFile of validatedFiles) {
        if (validatedFile?.path) {
          await fs.unlink(validatedFile.path).catch(() => {});
        }
      }
    };

    // Validate each file
    for (const file of files) {
      if (!file) continue;

      // Track file before validation starts
      validatedFiles.push(file);

      // ===== Size Validation =====
      if (file.size > maxSize) {
        // Clean up all validated files (including this one)
        await cleanupValidatedFiles();
        return res.status(400).json({ 
          error: `File "${file.originalname}" too large. Maximum size is 10MB.` 
        });
      }

      // ===== Filename Validation (Path Traversal Prevention) =====
      const filename = path.basename(file.originalname);
      if (filename !== file.originalname) {
        // Filename contains directory separators or traversal sequences
        // Clean up all validated files (including this one)
        await cleanupValidatedFiles();
        return res.status(400).json({ 
          error: `Invalid filename "${file.originalname}". Filenames cannot contain path separators.` 
        });
      }

      // ===== MIME Type Validation (Declared vs Actual) =====
      // Get actual MIME type from file content
      let actualMime = file.mimetype; // Fallback to declared
      let fileContentBuffer = null;

      if (file.buffer) {
        // File in memory - check content
        fileContentBuffer = file.buffer;
        const detectedType = await fileTypeFromBuffer(file.buffer);
        if (detectedType) {
          actualMime = detectedType.mime;
        }
      } else if (file.path) {
        // File on disk - read buffer and check content
        try {
          fileContentBuffer = await fs.readFile(file.path);
          const detectedType = await fileTypeFromBuffer(fileContentBuffer);
          if (detectedType) {
            actualMime = detectedType.mime;
          }
        } catch (readErr) {
          console.error(`Failed to read file for MIME detection: ${file.path}`, readErr);
          await cleanupValidatedFiles();
          return res.status(500).json({ 
            error: 'Failed to validate file' 
          });
        }
      }

      // ===== Special Validation for text/plain (file-type cannot detect text) =====
      // Prevent binary files from being uploaded with spoofed 'text/plain' MIME type
      if (file.mimetype === 'text/plain' && fileContentBuffer) {
        // Check for binary indicators (null bytes, control characters)
        let hasBinaryContent = false;
        const maxBytesToCheck = Math.min(8192, fileContentBuffer.length); // Check first 8KB
        
        for (let i = 0; i < maxBytesToCheck; i++) {
          const byte = fileContentBuffer[i];
          // Null byte is a strong binary indicator
          if (byte === 0) {
            hasBinaryContent = true;
            break;
          }
          // Check for other suspicious control characters (excluding allowed ones like \n, \r, \t)
          if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            hasBinaryContent = true;
            break;
          }
        }

        if (hasBinaryContent) {
          await cleanupValidatedFiles();
          return res.status(400).json({ 
            error: `File "${file.originalname}" appears to contain binary data. Only text files are allowed for text/plain.` 
          });
        }
      }

      // Check if actual MIME is in allowed list
      if (!allowedMimes.includes(actualMime)) {
        // Clean up all validated files (including this one)
        await cleanupValidatedFiles();
        return res.status(400).json({ 
          error: `Invalid file type "${actualMime}" for "${file.originalname}". Allowed types: JPEG, PNG, GIF, WebP, PDF, plain text.` 
        });
      }

      // Log successful validation
      console.log(`✓ File validated: ${filename} (${actualMime}, ${file.size} bytes)`);
    }

    next();
  } catch (error) {
    console.error('File validation error:', error);
    
    // Attempt cleanup
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    if (req.files) {
      for (const file of Object.values(req.files).flat()) {
        if (file?.path) {
          await fs.unlink(file.path).catch(() => {});
        }
      }
    }

    res.status(500).json({ error: 'File validation error' });
  }
};

// Production error handler
// ============================================================================
// Structured logging with proper status codes and client error handling
// - 4xx: Return actual error message to client (client error)
// - 5xx: Return generic message in production (server error)
// - Stack trace only in development
// - Checks if headers already sent to avoid double-response errors
// ============================================================================
export const errorHandler = (err, req, res, next) => {
  // Compute status code
  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const isClientError = status >= 400 && status < 500;
  const isServerError = status >= 500;

  // Prepare error message based on status and environment
  const message = isServerError && isProduction 
    ? 'Internal server error' 
    : err.message || 'Unknown error';

  // Build log metadata
  const logMeta = {
    status,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.userId || 'unauthenticated',
    errorName: err.name,
    errorCode: err.code,
  };

  // Log the error with structured format
  if (isServerError) {
    logger.error(`Server error: ${err.message}`, {
      ...logMeta,
      stack: err.stack,
      originalError: isProduction ? undefined : err
    });
  } else {
    logger.warn(`Client error: ${err.message}`, logMeta);
  }

  // If headers already sent, delegate to Express error handler
  if (res.headersSent) {
    logger.error('Headers already sent, delegating to default handler', { status });
    return next(err);
  }

  // Construct response
  const response = {
    error: message,
    status,
    // Include timestamp for debugging
    timestamp: new Date().toISOString()
  };

  // Add stack trace only in development
  if (!isProduction && err.stack) {
    response.stack = err.stack;
  }

  // Send response with appropriate status code
  res.status(status).json(response);
};

// Export helmet for use in server.js
export { helmet };
