import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db.js';

const router = express.Router();

// Helper to hash token
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Middleware to authenticate JWT access tokens
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'fallback_access_secret', (err, user) => {
    if (err) {
      return res.status(403).json({ status: 'error', message: 'Invalid or expired access token' });
    }
    req.user = user;
    next();
  });
};

// 1. POST /auth/signup
// 1. POST /auth/signup
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ status: 'error', message: 'All fields are required' });
  }

  // Normalize email input
  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Check if user already exists
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [normalizedEmail, username]
    );

    if (existing.length > 0) {
      return res.status(409).json({ status: 'error', message: 'Username or email already registered' });
    }

    const id = crypto.randomUUID();
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Save user
    await db.query(
      'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)',
      [id, username, normalizedEmail, passwordHash]
    );

    // Generate tokens
    const accessToken = jwt.sign(
      { id, username, email: normalizedEmail },
      process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
      { expiresIn: '15m' }
    );
    
    // ... rest of the signup flow ...

    const refreshToken = crypto.randomBytes(40).toString('hex');
    const hashedRefresh = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Store refresh token
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [id, hashedRefresh, expiresAt]
    );

    // Set refresh token in HTTP-Only cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    return res.status(201).json({
      status: 'success',
      message: 'Account created successfully',
      accessToken,
      user: { id, username, email }
    });
  } catch (err) {
    console.error('Signup Error:', err);
    return res.status(500).json({ status: 'error', message: 'Database server error during registration' });
  }
});

// 2. POST /auth/login
// 2. POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Temporary debug logs to track down payload mismatch
  console.log('[DEBUG LOGIN] Request received:', {
    rawEmail: email,
    trimmedEmail: email ? email.trim() : null,
    lowercasedEmail: email ? email.toLowerCase() : null,
    passwordLength: password ? password.length : 0
  });

  if (!email || !password) {
    return res.status(400).json({ status: 'error', message: 'Email and password are required' });
  }

  // Normalize email input
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const [rows] = await db.query(
      'SELECT id, username, email, password_hash FROM users WHERE email = ?',
      [normalizedEmail]
    );

    console.log('[DEBUG LOGIN] Database query completed. Rows found:', rows.length);

    if (rows.length === 0) {
      console.log('[DEBUG LOGIN] No user found matching normalized email:', normalizedEmail);
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }

    const user = rows[0];

    console.log('[DEBUG LOGIN] Stored user from database:', {
      id: user.id,
      email: user.email,
      username: user.username,
      hashLength: user.password_hash ? user.password_hash.length : 0
    });

    const isMatch = await bcrypt.compare(password, user.password_hash);

    console.log('[DEBUG LOGIN] Bcrypt compare match result:', isMatch);

    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }

    // Update last login
    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    // Generate tokens
    const accessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
      { expiresIn: '15m' }
    );

    const refreshToken = crypto.randomBytes(40).toString('hex');
    const hashedRefresh = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Save refresh token
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, hashedRefresh, expiresAt]
    );

    // Set refresh token in HTTP-Only cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    return res.status(200).json({
      status: 'success',
      accessToken,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ status: 'error', message: 'Database server error during login' });
  }
});

// 3. POST /auth/refresh (Access Token renewal via Refresh Token Rotation)
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ status: 'error', message: 'Refresh token not found' });
  }

  const hashedRefresh = hashToken(refreshToken);

  try {
    // Check if token exists, is active and not expired
    const [rows] = await db.query(
      `SELECT rt.id, rt.user_id, u.username, u.email 
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token_hash = ? AND rt.expires_at > NOW() AND rt.revoked_at IS NULL`,
      [hashedRefresh]
    );

    if (rows.length === 0) {
      return res.status(403).json({ status: 'error', message: 'Invalid or expired refresh token' });
    }

    const session = rows[0];

    // Revoke old refresh token (Soft revocation / mark revoked)
    await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [session.id]);

    // Generate new Access and Refresh tokens
    const accessToken = jwt.sign(
      { id: session.user_id, username: session.username, email: session.email },
      process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
      { expiresIn: '15m' }
    );

    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    const newHashedRefresh = hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Store new refresh token
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [session.user_id, newHashedRefresh, expiresAt]
    );

    // Set new cookie
    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({ status: 'success', accessToken });
  } catch (err) {
    console.error('Refresh Token Error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error rotating session token' });
  }
});

// 4. POST /auth/logout
router.post('/logout', async (req, res) => {
  const refreshToken = req.cookies.refresh_token;

  if (refreshToken) {
    const hashedRefresh = hashToken(refreshToken);
    try {
      // Revoke the token
      await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?', [hashedRefresh]);
    } catch (err) {
      console.error('Logout Database Error:', err);
    }
  }

  // Clear cookie
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });

  return res.status(200).json({ status: 'success', message: 'Logged out successfully' });
});

// 5. GET /auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, email, profile_image FROM users WHERE id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    return res.status(200).json({ status: 'success', user: rows[0] });
  } catch (err) {
    console.error('Get Current User Error:', err);
    return res.status(500).json({ status: 'error', message: 'Server query error' });
  }
});

export default router;
