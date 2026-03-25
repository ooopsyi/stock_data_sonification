# Backend Gateway

FastAPI quote gateway for stock sonification.

## Features

- WebSocket endpoint for normalized quote events.
- Mock stream for local development.
- Tiger source mode (`QUOTE_SOURCE=tiger`) that pulls live quote briefs and trade ticks, including real volume data.
- Credentials remain backend-only.

## Run

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

When `QUOTE_SOURCE=tiger`, fill in `TIGER_ID` and `TIGER_PRIVATE_KEY_PK1` in `.env`. The backend will read `.env` automatically and stream Tiger trade-tick volume when available, with stock briefs as fallback.

## Endpoints

- `GET /health`
- `WS /ws/quotes?symbol=AAPL`
