import express from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { authenticateToken } from './auth.js';
import fetch from 'node-fetch';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';

const router = express.Router();

// Multer memory storage for file uploads (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
});

// Shared file parsing helper
const parseUploadedFile = async (file) => {
  const { originalname, mimetype, buffer } = file;
  const ext = originalname.split('.').pop().toLowerCase();
  let extractedText = '';

  if (ext === 'pdf' || mimetype === 'application/pdf') {
    // pdf-parse v2.x: PDFParse is a class, not a function
    const pdf = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const textResult = await pdf.getText();
      extractedText = textResult.text;
    } finally {
      await pdf.destroy();
    }
  } else {
    extractedText = buffer.toString('utf-8');
  }

  return { filename: originalname, content: extractedText, size: buffer.length };
};

// FILE UPLOAD: POST /upload — Extract text from PDF, CSV, or text files (authenticated)
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file provided' });
    }
    const result = await parseUploadedFile(req.file);
    return res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    console.error('File Upload Processing Error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to process uploaded file' });
  }
});

// GUEST FILE UPLOAD: POST /guest/upload — Same parsing but no auth required
router.post('/guest/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file provided' });
    }
    const result = await parseUploadedFile(req.file);
    return res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    console.error('Guest File Upload Processing Error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to process uploaded file' });
  }
});

// 1. POST /conversations (Create new conversation)
router.post('/conversations', authenticateToken, async (req, res) => {
  const { title } = req.body;
  const user_id = req.user.id;
  const conversation_id = crypto.randomUUID();

  try {
    await db.query(
      'INSERT INTO conversations (conversation_id, user_id, title) VALUES (?, ?, ?)',
      [conversation_id, user_id, title || 'New Conversation']
    );

    return res.status(201).json({
      status: 'success',
      conversation_id,
      title: title || 'New Conversation',
      created_at: new Date()
    });
  } catch (err) {
    console.error('Create Conversation Error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error creating conversation' });
  }
});

// 2. GET /conversations (List user's active conversations)
router.get('/conversations', authenticateToken, async (req, res) => {
  const user_id = req.user.id;

  try {
    const [rows] = await db.query(
      `SELECT c.conversation_id, c.title, c.updated_at,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.conversation_id) AS message_count
       FROM conversations c
       WHERE c.user_id = ? AND c.is_deleted = 0 AND c.is_archived = 0
       ORDER BY c.updated_at DESC`,
      [user_id]
    );

    return res.status(200).json({ status: 'success', conversations: rows });
  } catch (err) {
    console.error('Fetch Conversations Error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error fetching conversations' });
  }
});

// 3. GET /conversations/:id (Fetch single conversation details)
router.get('/conversations/:id', authenticateToken, async (req, res) => {
  const user_id = req.user.id;
  const conversation_id = req.params.id;

  try {
    const [rows] = await db.query(
      'SELECT conversation_id, title, created_at, updated_at FROM conversations WHERE conversation_id = ? AND user_id = ? AND is_deleted = 0',
      [conversation_id, user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Conversation not found' });
    }

    return res.status(200).json({ status: 'success', conversation: rows[0] });
  } catch (err) {
    console.error('Get Conversation Error:', err);
    return res.status(500).json({ status: 'error', message: 'Database query error' });
  }
});

// 4. DELETE /conversations/:id (Soft delete conversation)
router.delete('/conversations/:id', authenticateToken, async (req, res) => {
  const user_id = req.user.id;
  const conversation_id = req.params.id;

  try {
    const [result] = await db.query(
      'UPDATE conversations SET is_deleted = 1 WHERE conversation_id = ? AND user_id = ?',
      [conversation_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Conversation not found or unauthorized' });
    }

    return res.status(200).json({ status: 'success', message: 'Conversation deleted successfully' });
  } catch (err) {
    console.error('Delete Conversation Error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error marking conversation deleted' });
  }
});

// 5. GET /messages/:conversationId (Load message timeline chronologically)
router.get('/messages/:conversationId', authenticateToken, async (req, res) => {
  const user_id = req.user.id;
  const conversation_id = req.params.conversationId;

  try {
    const [authCheck] = await db.query(
      'SELECT conversation_id FROM conversations WHERE conversation_id = ? AND user_id = ? AND is_deleted = 0',
      [conversation_id, user_id]
    );

    if (authCheck.length === 0) {
      return res.status(403).json({ status: 'error', message: 'Access denied or conversation deleted' });
    }

    const [rows] = await db.query(
      `SELECT message_id, role, content, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC,
                CASE
                  WHEN role = 'user' THEN 0
                  WHEN role = 'assistant' THEN 1
                  ELSE 2
                END ASC,
                message_id ASC`,
      [conversation_id]
    );

    return res.status(200).json({ status: 'success', messages: rows });
  } catch (err) {
    console.error('Fetch Messages Error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error reading messages' });
  }
});

// 6. POST /messages (Submit prompt and connect to local llama-server stream)
router.post('/messages', authenticateToken, async (req, res) => {
  const { conversation_id, content } = req.body;
  const user_id = req.user.id;

  if (!conversation_id || !content) {
    return res.status(400).json({ status: 'error', message: 'Conversation ID and message content required' });
  }

  try {
    // 1. Verify user ownership
    const [authCheck] = await db.query(
      'SELECT conversation_id FROM conversations WHERE conversation_id = ? AND user_id = ? AND is_deleted = 0',
      [conversation_id, user_id]
    );

    if (authCheck.length === 0) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized access to conversation' });
    }

    // 2. Fetch entire chat history for Context Management
    const [pastMessages] = await db.query(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [conversation_id]
    );

    // Map DB rows to standard format: [{role: "user", content: "..."}]
    const formattedHistory = pastMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Add the fresh incoming prompt to the context array
    formattedHistory.push({ role: 'user', content: content });

    // 3. Insert User Query Message into DB
    const userMessageId = crypto.randomUUID();
    await db.query(
      'INSERT INTO messages (message_id, conversation_id, role, content) VALUES (?, ?, ?, ?)',
      [userMessageId, conversation_id, 'user', content]
    );

    // 4. Insert Placeholder AI Assistant Message in DB
    const assistantMessageId = crypto.randomUUID();
    await db.query(
      'INSERT INTO messages (message_id, conversation_id, role, content) VALUES (?, ?, ?, ?)',
      [assistantMessageId, conversation_id, 'assistant', '']
    );

    // Update conversation timestamp (bumps chat to top of sidebar)
    await db.query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ?',
      [conversation_id]
    );

    let completeAiResponse = "";
    let clientDisconnected = false;
    let streamCompleted = false;
    let hasCommittedAssistantMessage = false;
    let llamaReader = null;
    const llamaAbortController = new AbortController();

    const commitAssistantMessage = async () => {
      if (hasCommittedAssistantMessage) return;
      hasCommittedAssistantMessage = true;

      try {
        const approxTokenCount = Math.round(completeAiResponse.length / 4);
        await db.query(
          'UPDATE messages SET content = ?, token_count = ? WHERE message_id = ?',
          [completeAiResponse, approxTokenCount, assistantMessageId]
        );
      } catch (dbErr) {
        hasCommittedAssistantMessage = false;
        console.error('Failed to commit assistant message string to database:', dbErr);
      }
    };

    res.on('close', () => {
      if (streamCompleted) return;

      clientDisconnected = true;
      llamaAbortController.abort();

      if (llamaReader?.destroy) {
        llamaReader.destroy();
      }

      void commitAssistantMessage();
    });

    // 5. Configure Headers for genuine Server-Sent Events (SSE) stream back to frontend
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); 

    // Initial event payload containing structural IDs
    res.write(`data: ${JSON.stringify({ 
      meta: true, 
      userMessageId, 
      assistantMessageId 
    })}\n\n`);

    try {
      const llamaResponse = await fetch('http://localhost:8080/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: llamaAbortController.signal,
        body: JSON.stringify({
          messages: formattedHistory, // Local history array gives it memory natively!
          stream: true                 // Instructs llama-server to output chunked text
        })
      });

      if (!llamaResponse.ok) {
        throw new Error(`llama-server returned status: ${llamaResponse.status}`);
      }

      // Read llama-server response stream line-by-line
      llamaReader = llamaResponse.body;
      llamaReader.setEncoding('utf8');

      let buffer = '';

      await new Promise((resolve, reject) => {
        llamaReader.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          
          // Save trailing line fragments back to buffer
          buffer = lines.pop();

          for (const line of lines) {
            const cleanedLine = line.trim();
            if (!cleanedLine || cleanedLine === 'data: [DONE]') continue;

            if (cleanedLine.startsWith('data: ')) {
              try {
                const parsedJson = JSON.parse(cleanedLine.replace('data: ', ''));
                const tokenContent = parsedJson.choices[0]?.delta?.content || "";

                if (tokenContent) {
                  completeAiResponse += tokenContent;
                  // Immediately pass the token along to your frontend listener
                  if (!clientDisconnected && !res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ chunk: tokenContent })}\n\n`);
                  }
                }
              } catch (jsonErr) {
                // Skips incomplete chunks gracefully
              }
            }
          }
        });

        llamaReader.on('end', () => resolve());
        llamaReader.on('error', (err) => {
          if (clientDisconnected) {
            resolve();
          } else {
            reject(err);
          }
        });
      });

    } catch (llamaErr) {
      if (!clientDisconnected) {
        console.error("Critical error communicating with llama-server:", llamaErr);
        completeAiResponse = "\n\n**Backend Connection Error:** Failed to establish communication with llama-server. Ensure it's running locally on port 8080.";
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ chunk: completeAiResponse })}\n\n`);
        }
      }
    }

    // 7. Stream Termination - Write final accumulated token generation back to MySQL
    await commitAssistantMessage();

    if (clientDisconnected || res.writableEnded) return;

    // Signal frontend that the stream is officially finished
    res.write('data: [DONE]\n\n');
    streamCompleted = true;
    res.end();

  } catch (err) {
    console.error('Streaming Lifecycle Failure:', err);
    if (!res.headersSent) {
      return res.status(500).json({ status: 'error', message: 'Internal server boundary error handling message stream' });
    }
    res.end();
  }
});

// ============================================================
// GUEST (ANONYMOUS) CHAT — No auth, no DB persistence
// Session-only: frontend keeps messages in memory
// ============================================================

router.post('/guest/messages', async (req, res) => {
  const { messages: chatHistory, content } = req.body;

  if (!content) {
    return res.status(400).json({ status: 'error', message: 'Message content is required' });
  }

  try {
    // Build message array from frontend-supplied session history
    const formattedHistory = Array.isArray(chatHistory) ? [...chatHistory] : [];
    formattedHistory.push({ role: 'user', content });

    // Configure SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let completeAiResponse = '';

    try {
      const llamaResponse = await fetch('http://localhost:8080/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: formattedHistory,
          stream: true
        })
      });

      if (!llamaResponse.ok) {
        throw new Error(`llama-server returned status: ${llamaResponse.status}`);
      }

      const reader = llamaResponse.body;
      reader.setEncoding('utf8');

      let buffer = '';

      await new Promise((resolve, reject) => {
        reader.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const cleanedLine = line.trim();
            if (!cleanedLine || cleanedLine === 'data: [DONE]') continue;

            if (cleanedLine.startsWith('data: ')) {
              try {
                const parsedJson = JSON.parse(cleanedLine.replace('data: ', ''));
                const tokenContent = parsedJson.choices[0]?.delta?.content || '';

                if (tokenContent) {
                  completeAiResponse += tokenContent;
                  res.write(`data: ${JSON.stringify({ chunk: tokenContent })}\n\n`);
                }
              } catch (jsonErr) {
                // Skip incomplete JSON chunks
              }
            }
          }
        });

        reader.on('end', () => resolve());
        reader.on('error', (err) => reject(err));
      });

    } catch (llamaErr) {
      console.error('Guest chat — llama-server error:', llamaErr);
      const errorMsg = '\n\n**Backend Connection Error:** Failed to communicate with llama-server. Ensure it is running on port 8080.';
      res.write(`data: ${JSON.stringify({ chunk: errorMsg })}\n\n`);
    }

    // No DB writes — stream is purely ephemeral
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('Guest Streaming Lifecycle Failure:', err);
    if (!res.headersSent) {
      return res.status(500).json({ status: 'error', message: 'Internal error handling guest message stream' });
    }
    res.end();
  }
});

export default router;
