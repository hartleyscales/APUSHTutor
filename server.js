// server.js — Tiny proxy for APUSH AI Tutor
const express = require('express');
const { OpenAI } = require('openai');
const cors = require('cors');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

require('dotenv').config();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = process.env.ASSISTANT_ID;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const app = express();

// Serve static files (including index.html) from project root
app.use(express.static(__dirname));

// Enable CORS for browser requests
app.use(cors());
// Manually handle CORS pre-flight requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Parse JSON bodies
app.use(express.json());

// Chat endpoint
app.post('/chat', upload.single('image'), async (req, res) => {
  let messages = req.body.messages;
  if (typeof messages === 'string') {
    try {
      messages = JSON.parse(messages);
    } catch {}
  }
  // If an image was uploaded, it's available as req.file

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request format. Expecting { messages: [...] }' });
  }

  try {
    // Create a new thread with the user's messages
    const thread = await openai.beta.threads.create({ messages });

    // Run the assistant on that thread
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
      stream: false,
    });

    // Poll until the run is complete
    let status;
    do {
      status = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      if (status.status === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (true);

    // Fetch all messages in the thread and return the assistant's reply
    const messagesResp = await openai.beta.threads.messages.list(thread.id);
    const assistantMsg = messagesResp.data.find(m => m.role === 'assistant');
    const text = assistantMsg?.content?.[0]?.text?.value || 'No response from assistant.';
    res.json({ reply: text });

  } catch (error) {
    console.error('Error in /chat:', error);
    res.status(500).json({ error: 'Error contacting the assistant.' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proxy listening at http://localhost:${PORT}`);
});
