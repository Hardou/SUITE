# BlankDigi Suite

## Local development

### Frontend

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_API_URL=http://localhost:8000` if your FastAPI backend runs locally.
4. Run:
   `npm run dev`

The frontend must never receive `GEMINI_API_KEY`. Gemini and Veo requests are proxied through the authenticated FastAPI backend.

### Backend

1. Install dependencies:
   `pip install -r backend/requirements.txt`
2. Copy `backend/.env.example` to your server-side environment/configuration.
3. Set a strong `JWT_SECRET_KEY` (32+ characters).
4. Set `GEMINI_API_KEY` only on the backend.
5. In production, set `AI_ALLOWED_EMAILS` to the comma-separated accounts allowed to use AI generation.

For local development, set `APP_ENV=development`. Outside local development the backend refuses to start without a valid JWT secret, and AI access fails closed unless `AI_ALLOWED_EMAILS` is configured.
