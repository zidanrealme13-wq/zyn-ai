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

### CORS

The backend serves the frontend itself, so the default setup is same-origin and does not need a CORS allowlist. During development, CORS permits HTTP origins on `localhost` and `127.0.0.1`, plus `null` for the supported `file://` frontend. In production, cross-origin requests are denied unless the frontend origin is explicitly configured in `backend/.env`:

```env
NODE_ENV=production
CORS_ORIGINS=https://your-frontend.example
```

For multiple frontend origins, separate the exact origins with commas. Do not include paths or trailing slashes.

### Deploy ke Railway

Repository ini sudah menyertakan `railway.json` untuk menginstal dependency dari `backend`, menjalankan server, dan memeriksa `/api/health`.

1. Push repository ke GitHub, lalu buat project Railway dari repository tersebut. Biarkan **Root Directory** kosong (root repository).
2. Tambahkan environment variables di Railway: `NODE_ENV=production`, `JWT_SECRET` yang baru dan acak (minimal 32 karakter), serta minimal satu API key provider (`OPENROUTER_API_KEY`, `GROQ_API_KEY`, atau `GEMINI_API_KEY`).
3. Deploy. Railway akan otomatis deploy ulang setiap kali ada push baru ke branch yang terhubung.
4. Buka domain Railway untuk menggunakan frontend dan backend pada origin yang sama. `CORS_ORIGINS` tidak perlu diatur untuk konfigurasi ini; isi hanya jika frontend di-host pada domain terpisah.

**Catatan penyimpanan:** data akun pada `backend/data/users.json` dan file upload pada `backend/uploads` berada di filesystem lokal. Data tersebut bisa hilang saat container diganti atau di-deploy ulang. Untuk penggunaan permanen, gunakan database dan object storage atau pasang Railway Volume ke lokasi data tersebut.