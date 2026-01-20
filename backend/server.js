require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import routes
const sceneRoutes = require('./routes/scene');
const voiceoverRoutes = require('./routes/voiceover');
const videoRoutes = require('./routes/video');

const app = express();
const PORT = process.env.PORT || 3003;

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5180',
  'http://localhost:3000'
];

const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins;

// Create temp uploads directory
const TEMP_UPLOADS_DIR = path.join(__dirname, 'temp-uploads');
if (!fs.existsSync(TEMP_UPLOADS_DIR)) {
  fs.mkdirSync(TEMP_UPLOADS_DIR, { recursive: true });
}

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.CORS_ALLOW_ALL === 'true') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve temp uploads as static files
app.use('/temp-uploads', express.static(TEMP_UPLOADS_DIR));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mockMode: process.env.MOCK_MODE === 'true',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/scene', sceneRoutes);
app.use('/api/voiceover', voiceoverRoutes);
app.use('/api/video', videoRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  console.error(err.stack);
  
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      code: err.code || 'INTERNAL_ERROR'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Endpoint not found',
      code: 'NOT_FOUND'
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 AI Clone Video Backend Server`);
  console.log(`   Running on: http://localhost:${PORT}`);
  console.log(`   Mock Mode: ${process.env.MOCK_MODE === 'true' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`   Press Ctrl+C to stop\n`);
});





