const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth');

const app = express();

// Middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.CORS_ORIGIN || 'https://yourdomain.com').split(',')
    : '*',
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// Routes
app.use('/auth', authRoutes);

// Root health check for Railway
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Vipps Login Test API',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Something went wrong' });
});

module.exports = app;