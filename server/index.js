import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(s => s.trim());

// Dynamic CORS: accept listed origins + any private/LAN IP on the frontend dev port
app.use(cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // Always allow explicitly listed origins from .env
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Allow any private network IP (LAN) accessing on the Vite dev port
      // Matches: 192.168.x.x, 10.x.x.x, 172.16-31.x.x, and localhost variants
      const lanPattern = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|localhost|127\.0\.0\.1)(:\d+)?$/;
      if (lanPattern.test(origin)) return callback(null, true);

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());

// Route Mappings
app.use('/auth', authRouter);
app.use('/', chatRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({ status: 'error', message: 'Something went wrong inside the server' });
});

// app.listen(PORT, () => {
//   console.log(`AetherAI Express Server is running on port ${PORT}`);
//   console.log(`Accepting CORS requests from: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
// });


app.listen(PORT, '0.0.0.0', () => {
  console.log(`AetherAI Express Server is running on port ${PORT}`);
  console.log(`Network Access: OPEN (Listening on http://0.0.0.0:${PORT})`);
  console.log(`Accepting CORS requests from: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});