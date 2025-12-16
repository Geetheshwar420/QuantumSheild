# QuantumShield Deployment Guide

This guide covers deploying QuantumShield to production environments.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Backend Deployment](#backend-deployment)
- [Frontend Deployment](#frontend-deployment)
- [Production Checklist](#production-checklist)
- [Monitoring & Maintenance](#monitoring--maintenance)

---

## Prerequisites

### System Requirements
- **Node.js**: >= 16.0.0
- **npm**: >= 8.0.0
- **Memory**: Minimum 512MB RAM
- **Storage**: Minimum 1GB available space

### Required Services
- SSL/TLS certificate (for HTTPS)
- Domain name (optional but recommended)
- Process manager (PM2 recommended)

---

## Environment Setup

### 1. Backend Environment Variables

Create `.env` file in the `backend/` directory:

```bash
# Server Configuration
PORT=3001
NODE_ENV=production

# JWT Configuration
JWT_SECRET=YOUR_STRONG_SECRET_KEY_CHANGE_THIS
JWT_EXPIRY=3600

# Database Configuration
DB_PATH=./quantumshield.db

# CORS Configuration (comma-separated)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# Security
BCRYPT_SALT_ROUNDS=10
```

**Important**: 
- Generate a strong JWT_SECRET using: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- Update ALLOWED_ORIGINS with your actual domain(s)

### 2. Frontend Environment Variables

Create `.env.production` file in the `frontend/` directory:

```bash
# API Configuration
REACT_APP_API_URL=https://api.yourdomain.com
REACT_APP_SOCKET_URL=https://api.yourdomain.com

# Environment
REACT_APP_ENV=production
```

---

## Backend Deployment

### Option 1: Traditional VPS/Server Deployment

#### Step 1: Install Dependencies
```bash
cd backend
npm install --production
```

#### Step 2: Install PM2 (Process Manager)
```bash
npm install -g pm2
```

#### Step 3: Start the Backend
```bash
# Start with PM2
pm2 start src/server.js --name quantumshield-backend

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

#### Step 4: Configure Reverse Proxy (Nginx)

Create `/etc/nginx/sites-available/quantumshield-backend`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/ssl/certificate.crt;
    ssl_certificate_key /path/to/ssl/private.key;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/quantumshield-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Option 2: Docker Deployment

Create `backend/Dockerfile`:

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3001

CMD ["node", "src/server.js"]
```

Build and run:
```bash
docker build -t quantumshield-backend .
docker run -d -p 3001:3001 --env-file .env --name quantumshield-backend quantumshield-backend
```

---

## Frontend Deployment

### Step 1: Build for Production
```bash
cd frontend
npm install
npm run build
```

### Step 2: Deploy Static Files

#### Option A: Nginx
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /path/to/ssl/certificate.crt;
    ssl_certificate_key /path/to/ssl/private.key;

    root /var/www/quantumshield/build;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Option B: Vercel
```bash
npm install -g vercel
vercel --prod
```

#### Option C: Netlify
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=build
```

---

## Production Checklist

### Security
- [ ] Change default JWT_SECRET to a strong random value
- [ ] Enable HTTPS/SSL certificates
- [ ] Set NODE_ENV=production
- [ ] Configure proper CORS origins (no wildcards)
- [ ] Implement rate limiting (consider using express-rate-limit)
- [ ] Set secure headers (helmet.js)
- [ ] Regular security updates (`npm audit`)

### Performance
- [ ] Enable gzip compression
- [ ] Configure proper caching headers
- [ ] Optimize database indexes
- [ ] Set up CDN for static assets (optional)
- [ ] Monitor memory usage

### Database
- [ ] Regular database backups
- [ ] Set up backup retention policy
- [ ] Test restore procedures

### Monitoring
- [ ] Set up uptime monitoring
- [ ] Configure error logging
- [ ] Set up alerting for critical errors
- [ ] Monitor disk space
- [ ] Monitor API response times

### Testing
- [ ] Test all API endpoints
- [ ] Verify WebSocket connections
- [ ] Test file upload functionality
- [ ] Verify friend request system
- [ ] Test authentication flow
- [ ] Cross-browser testing

---

## Monitoring & Maintenance

### PM2 Monitoring
```bash
# View logs
pm2 logs quantumshield-backend

# Monitor resources
pm2 monit

# Restart application
pm2 restart quantumshield-backend

# View status
pm2 status
```

### Database Backup
```bash
# Backup database
cp backend/quantumshield.db backups/quantumshield-$(date +%Y%m%d).db

# Automated backup (add to crontab)
0 2 * * * cp /path/to/backend/quantumshield.db /path/to/backups/quantumshield-$(date +\%Y\%m\%d).db
```

### Health Check
```bash
# Check backend health
curl https://api.yourdomain.com/health

# Expected response:
# {"status":"ok","environment":"production","timestamp":"2025-11-17T..."}
```

### Log Rotation
Configure log rotation in `/etc/logrotate.d/quantumshield`:

```
/var/log/quantumshield/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

---

## Troubleshooting

### Backend not starting
1. Check environment variables are set correctly
2. Verify port 3001 is not in use: `lsof -i :3001`
3. Check PM2 logs: `pm2 logs quantumshield-backend`
4. Verify database file permissions

### WebSocket connection issues
1. Verify Nginx WebSocket configuration
2. Check CORS settings in backend
3. Ensure firewall allows WebSocket connections
4. Verify SSL certificate covers WebSocket endpoint

### Frontend not connecting to backend
1. Verify REACT_APP_API_URL is correct
2. Check CORS configuration on backend
3. Verify SSL certificates are valid
4. Check browser console for errors

---

## Scaling Considerations

### Horizontal Scaling
- Use Redis for session storage
- Implement Socket.IO Redis adapter for multiple instances
- Use a load balancer (Nginx, HAProxy)
- Consider database replication

### Vertical Scaling
- Increase server resources (CPU, RAM)
- Optimize database queries
- Implement caching layer (Redis)

---

## Support & Resources

- **GitHub Repository**: https://github.com/Geetheshwar420/QuantumSheild
- **Issues**: Report issues on GitHub
- **Documentation**: See README.md for development setup

---

## Version History

- **v1.0.0** - Initial production release
  - Password-based authentication
  - Friend request system
  - Real-time messaging
  - File upload support
