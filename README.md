# Stock Data Sonification MVP

Web-first MVP for turning market data into live music with chart rendering.

## Implemented in this kickoff

- React + TypeScript frontend with:
  - Symbol input and Start/Stop controls.
  - 20-genre selector.
  - Fidelity slider (Musical to Analytical).
  - A/B mode (Raw market vs Smoothed composition).
  - Market Mood labels (Calm, Bullish, Bearish, Turbulent).
  - Replay controls (60s/120s/180s).
  - Real-time K-line style candle drawing.
  - Bilingual disclaimer (EN + 中文).
- FastAPI backend gateway with:
  - WebSocket quote stream endpoint.
  - Mock quote generator for local development.
  - Tiger source switch placeholder for server-side integration.

## Project layout

- `frontend/` - React app.
- `backend/` - FastAPI quote gateway.

## Run backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend expects backend WebSocket at `ws://localhost:8000/ws/quotes`.

## Security

- Keep all Tiger credentials on backend only.
- Never commit `tiger_openapi_config*.properties`, `.env`, or private keys.
- If a private key was exposed, regenerate keys immediately.
