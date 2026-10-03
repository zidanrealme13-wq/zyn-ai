/**
 * ZYN AI Backend Server
 * SECURITY: API key hanya dari process.env, tidak pernah ke frontend
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const configuredCorsOrigins = new Set(
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (configuredCorsOrigins.has(origin)) return true;
  if (isProduction) return false;
  if (origin === 'null') return true;

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.protocol === 'http:' &&
      (parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.', code: 'RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(cors({
  origin: function (origin, callback) {
    return callback(null, isAllowedOrigin(origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type']
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/api/auth', authRoutes);
app.use('/api/secure-chat', chatRoutes);
app.use('/api/upload', uploadRoutes);

const SYSTEM_PROMPTS = {
  GENERAL: `You are ZYN AI, a professional, helpful, and precise AI assistant operating inside a Cyber Command Center interface. Be clear, accurate, and concise. Respond in the same language the user writes in.`,
  CODER: `You are ZYN AI in CODER mode. You specialize in programming, debugging, software architecture, and code review. Focus on: HTML, CSS, JavaScript, Node.js, Python, TypeScript, React, and modern web/backend technologies. Provide clean, well-commented code when requested. Explain bugs clearly and suggest best practices. Always prefer secure and maintainable solutions.`,
  STUDY: `You are ZYN AI in STUDY mode. You help users learn effectively. Explain concepts simply, use analogies, break down complex topics step-by-step. Create practice questions, summaries, and study plans when asked. Encourage understanding rather than rote memorization. Adapt difficulty to the user.`,
  CYBER: `You are ZYN AI in CYBER mode. You focus on defensive cybersecurity education and legal, ethical topics only. Topics: networking fundamentals, Linux, defensive security concepts, secure coding practices, CTF/lab challenges that are legal and educational, threat modeling, and general security awareness. NEVER provide instructions for illegal activities, offensive hacking of systems you do not own, malware creation, or unauthorized access. Always emphasize legal and ethical use of knowledge.`,
  PROMPT: `You are ZYN AI in PROMPT mode. You help users craft and improve prompts for AI systems. Analyze the user's goal, suggest clearer structure, add useful constraints, and improve specificity. Provide the improved prompt ready to copy, and briefly explain the changes.`
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'ZYN AI', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  const models = [];
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    models.push({ id: 'openrouter/auto', label: 'OpenRouter · Auto' });
  }
  if (process.env.GROQ_API_KEY?.trim()) {
    models.push({ id: 'groq/qwen/qwen3.8-27b', label: 'Groq · Qwen 3.8 27B' });
  }
  if ((process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim()) {
    models.push({ id: 'gemini-3.8-flash', label: 'Google Gemini · Flash' });
  }
  res.json({
    configured: models.length > 0,
    models,
    defaultModel: models[0]?.id || null,
    modes: Object.keys(SYSTEM_PROMPTS)
  });
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const { messages, mode, model, temperature } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid request. Messages array is required.', code: 'INVALID_BODY' });
    }
    if (messages.length > 50) {
      return res.status(400).json({ error: 'Too many messages in conversation.', code: 'TOO_MANY_MESSAGES' });
    }
    for (const msg of messages) {
      if (!msg.role || !msg.content || typeof msg.content !== 'string') {
        return res.status(400).json({ error: 'Each message must have role and content.', code: 'INVALID_MESSAGE' });
      }
      if (msg.content.length > 12000) {
        return res.status(400).json({ error: 'Message content too long.', code: 'CONTENT_TOO_LONG' });
      }
    }

    const selectedModel = typeof model === 'string' && model.trim() ? model.trim() : 'openrouter/auto';
    const isGroqModel = selectedModel.startsWith('groq/');
    const isGeminiModel = selectedModel.startsWith('gemini-');
    const apiKey = isGeminiModel
      ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      : isGroqModel ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      const provider = isGeminiModel ? 'Gemini' : isGroqModel ? 'Groq' : 'OpenRouter';
      return res.status(503).json({ error: `${provider} is not configured on the backend.`, code: 'NOT_CONFIGURED' });
    }

    const selectedMode = (mode && SYSTEM_PROMPTS[mode.toUpperCase()]) ? mode.toUpperCase() : 'GENERAL';
    const systemPrompt = SYSTEM_PROMPTS[selectedMode];
    const temp = typeof temperature === 'number' ? Math.max(0, Math.min(2, temperature)) : 0.7;

    let response;
    if (isGeminiModel) {
      const contents = messages.map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
      }));
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: temp, maxOutputTokens: 4096 }
          })
        }
      );
    } else {
      const providerModel = isGroqModel ? selectedModel.slice('groq/'.length) : selectedModel;
      const openRouterMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map(message => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content
        }))
      ];
      response = await fetch(isGroqModel
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(isGroqModel ? {} : {
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL || `http://localhost:${PORT}`,
            'X-Title': 'ZYN AI'
          })
        },
        body: JSON.stringify({
          model: providerModel,
          messages: openRouterMessages,
          temperature: temp,
          max_tokens: 4096
        })
      });
    }

    if (!response.ok) {
      let userMessage = 'Unable to reach ZYN CORE. Please try again.';
      let errorCode = 'API_ERROR';
      const providerError = await response.text();
      const providerName = isGeminiModel ? 'Gemini' : isGroqModel ? 'Groq' : 'OpenRouter';
      if (!isGeminiModel && !isGroqModel && response.status === 402) {
        userMessage = 'OpenRouter credits are exhausted. Check your account balance.';
        errorCode = 'CREDITS_EXHAUSTED';
      } else if (response.status === 401 || response.status === 403) {
        userMessage = 'ZYN AI backend is not configured correctly. Check your API key.';
        errorCode = 'AUTH_ERROR';
      } else if (response.status === 429) {
        userMessage = 'Rate limit reached. Please wait a moment and try again.';
        errorCode = 'RATE_LIMIT';
      } else if (response.status === 404) {
        userMessage = `${providerName} model was not found or is unavailable. Select another model or check the backend model configuration.`;
        errorCode = 'MODEL_UNAVAILABLE';
      } else if (response.status === 400) {
        userMessage = `${providerName} rejected the selected model or request.`;
        errorCode = 'BAD_REQUEST';
      } else if (response.status === 503) {
        userMessage = `${providerName} is temporarily busy. Please try again in a moment.`;
        errorCode = 'PROVIDER_BUSY';
      }
      console.error(`[ZYN] ${providerName} API error: status=${response.status} body=${providerError}`);
      return res.status(response.status >= 500 ? 502 : response.status).json({ error: userMessage, code: errorCode });
    }

    const data = await response.json();
    const content = isGeminiModel
      ? data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('')
      : data.choices?.[0]?.message?.content;
    res.json({
      content: typeof content === 'string' ? content : '',
      model: data.model || selectedModel,
      mode: selectedMode,
      usage: isGeminiModel ? data.usageMetadata || null : data.usage || null
    });
  } catch (err) {
    console.error('[ZYN] Server error:', err.message);
    res.status(500).json({ error: 'Unable to reach ZYN CORE. Please try again.', code: 'SERVER_ERROR' });
  }
});

app.listen(PORT, () => {
  const hasKey = [process.env.OPENROUTER_API_KEY, process.env.GROQ_API_KEY,
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY]
    .some(apiKey => apiKey?.trim());
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║           ZYN AI CORE ONLINE             ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  Port      : ${PORT}`);
  console.log(`  Health    : http://127.0.0.1:${PORT}/api/health`);
  console.log(`  Configured: ${hasKey ? 'YES' : 'NO - set a provider API key in backend/.env'}`);
  console.log('');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});