# ZYN AI

**Cyber Security AI Command Center**

ZYN AI is a full-stack AI assistant interface inspired by futuristic cyber security dashboards and command centers. It connects to **OpenRouter**, **Groq**, and **Google Gemini** through a secure Node.js backend.

---

## Overview

- Modern dark glass / HUD interface
- Multiple AI modes: GENERAL, CODER, STUDY, CYBER, PROMPT
- Chat history stored in browser localStorage
- Markdown + code block rendering with copy buttons
- Secure backend (API key never reaches the frontend)
- Responsive design (desktop, tablet, mobile)

---

## Requirements

- **Node.js** 18 or newer
- An **OpenRouter**, **Groq**, and/or **Google Gemini** API key ([OpenRouter](https://openrouter.ai/keys), [Groq](https://console.groq.com/keys), [Google AI Studio](https://aistudio.google.com/app/apikey))
- A modern browser (Chrome, Edge, Firefox, Android Chrome)

---

## Installation

1. Open a terminal in the project root:

```bash
cd ZYN-AI
```

2. Install backend dependencies and create the local environment file:

```bash
cd backend
npm install
```

On Windows PowerShell, copy the example configuration with:

```powershell
Copy-Item .env.example .env
```

Run that command only if `backend/.env` does not already exist. If it exists, keep it and add any missing variables from `.env.example`. Set at least one AI provider API key and replace `JWT_SECRET` with a random secret of 32 or more characters in `backend/.env`.

3. Start the backend from the `backend` directory:

```bash
npm start
```

Open `http://localhost:3001`. The existing chat API is available at `/api/chat`; the additional endpoints are `/api/auth/register`, `/api/auth/login`, `/api/secure-chat`, and `/api/upload`.