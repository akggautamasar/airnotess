# 📚 AirNotes v3

A Telegram-powered PDF library. Send PDFs to a Telegram bot → read them in a beautiful web app.

---

## How it works

```
You ──send PDF──▶ Telegram Bot ──webhook──▶ AirNotes Backend ──SQLite──▶ stored
                                                   │
                                              PDF Reader ◀── AirNotes Frontend
```

- You send/forward any PDF to your bot in Telegram
- The backend receives it via webhook and stores the `file_id` in SQLite
- The PDF appears instantly in your AirNotes library
- Click to open it in the full-featured reader

---

## Setup (15 minutes)

### Step 1 — Create a Telegram Bot

1. Open Telegram → search **@BotFather**
2. Send `/newbot` → follow prompts → copy the **Bot Token**

### Step 2 — Deploy the Backend

**Render (recommended — free tier works):**

1. Push the `backend/` folder to GitHub
2. New Render Web Service → connect repo → set root to `backend/`
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variables (see below)
6. Copy your Render URL (e.g. `https://airnotes-xxx.onrender.com`)

**Environment variables for backend:**
```
TELEGRAM_BOT_TOKEN = your_bot_token_from_botfather
WEBHOOK_URL        = https://airnotes-xxx.onrender.com
JWT_SECRET         = any_long_random_string_here
APP_PASSWORD       = Airflix@2003
DB_PATH            = /tmp/airnotes.db
```

> **Important:** `WEBHOOK_URL` must be your actual public backend URL.
> The app uses this to register itself with Telegram automatically on startup.

### Step 3 — Deploy the Frontend

**Vercel (recommended — free):**

1. Push `frontend/` to GitHub
2. New Vercel Project → connect repo → set root to `frontend/`
3. Add environment variable:
   ```
   VITE_API_URL = https://airnotes-xxx.onrender.com/api
   ```
4. Deploy

### Step 4 — Add PDFs to your library

1. Open Telegram → find your bot → press **Start**
2. **Send any PDF file** to the bot, or **forward** a PDF from any other chat
3. Bot replies "✅ Added to your library!"
4. Open AirNotes → your PDF is there instantly

**Bot commands:**
- `/start` or `/help` — show instructions
- `/list` — list all PDFs in library
- `/count` — count total PDFs
- `/delete [id]` — remove a PDF

---

## Local Development

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env — set BOT_TOKEN, set WEBHOOK_URL to your ngrok URL
npm install
npm run dev

# For webhook to work locally, use ngrok:
ngrok http 3001
# Copy the https URL → set WEBHOOK_URL=https://xxxx.ngrok.io in .env
# Restart the backend to re-register the webhook

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

---

## File Size Limits

| Size | Status |
|------|--------|
| < 20 MB | ✅ Works perfectly |
| > 20 MB | ⚠️ Stored in library but cannot be opened (Telegram Bot API limit) |

To support files over 20 MB, set up a [Telegram Local Bot API Server](https://core.telegram.org/bots/api#using-a-local-bot-api-server).

---

## Data Persistence on Render Free Tier

Render free tier uses ephemeral storage — the SQLite file at `/tmp/airnotes.db` is lost on redeploy.

**Fix:** Add a Render Disk (paid add-on, $1/month) → mount at `/data` → set `DB_PATH=/data/airnotes.db`

Or: upgrade to Render Starter ($7/month) which includes persistent storage.

---

## Project Structure

```
airnotes/
├── backend/
│   ├── server.js        ← Express + webhook + SQLite
│   ├── .env.example
│   └── package.json
└── frontend/
    └── src/
        ├── App.jsx
        ├── store/AppContext.jsx
        ├── utils/{api,storage,format}.js
        ├── pages/{LoginPage,MainApp}.jsx
        └── components/
            ├── Sidebar.jsx
            ├── ui/{TopBar,SearchModal}.jsx
            ├── library/{LibraryView,FileCard}.jsx
            └── reader/{PDFReader,ThumbnailSidebar,AnnotationSidebar}.jsx
```
