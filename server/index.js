import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = process.env.FRONTEND_URL.split(',');
// Enable CORS with Credentials support for secure HTTP-Only Refresh Tokens
app.use(cors({
    origin: allowedOrigins, // Now this is an array like ['url1', 'url2']
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