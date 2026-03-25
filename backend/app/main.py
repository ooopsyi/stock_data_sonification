from __future__ import annotations

import asyncio
import math
import os
import random
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from tigeropen.common.consts import BarPeriod, Language
from tigeropen.quote.quote_client import QuoteClient
from tigeropen.tiger_open_config import TigerOpenClientConfig

_backend_root = Path(__file__).resolve().parents[1]
_primary_env = _backend_root / ".env"
_fallback_env = _backend_root / ".env.prod"
if _primary_env.exists():
    load_dotenv(_primary_env, override=False)
elif _fallback_env.exists():
    load_dotenv(_fallback_env, override=False)

try:
    import certifi

    ca_bundle = certifi.where()
    os.environ.setdefault("SSL_CERT_FILE", ca_bundle)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", ca_bundle)
except Exception:
    # If certifi is unavailable, keep system defaults.
    pass

app = FastAPI(title="Stock Sonification Gateway", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@dataclass
class QuoteEvent:
    symbol: str
    timestamp: int
    price: float
    volume: int
    chgPct: float
    momentum: float
    preClose: float = 0.0

    def as_dict(self) -> dict[str, float | int | str]:
        return {
            "symbol": self.symbol,
            "timestamp": self.timestamp,
            "price": round(self.price, 4),
            "volume": self.volume,
            "chgPct": round(self.chgPct, 4),
            "momentum": round(self.momentum, 5),
            "preClose": round(self.preClose, 4),
        }


@dataclass
class TigerStreamState:
    reference_price: float | None = None
    last_price: float | None = None
    last_total_volume: int | None = None
    last_symbol: str | None = None
    last_timestamp_ms: int = 0
    last_brief_at: float = 0.0
    last_emit_at: float = 0.0


async def mock_quote_stream(symbol: str) -> AsyncGenerator[QuoteEvent, None]:
    base = random.uniform(80, 350)
    price = base
    step = 0
    while True:
        now_ms = int(time.time() * 1000)
        seasonal = math.sin(step / 19) * 0.08
        noise = random.uniform(-0.15, 0.15)
        delta = seasonal + noise
        price = max(1.0, price + delta)
        chg = ((price - base) / base) * 100
        momentum = delta * 12
        volume = int(100 + abs(delta) * 3000 + random.randint(20, 1500))
        step += 1

        yield QuoteEvent(
            symbol=symbol.upper(),
            timestamp=now_ms,
            price=price,
            volume=volume,
            chgPct=chg,
            momentum=momentum,
            preClose=base,
        )
        await asyncio.sleep(0.25)


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        value = os.getenv(name.lower(), "").strip()
    if not value:
        raise RuntimeError(f"Missing required Tiger setting: {name}")
    return value


def _normalize_private_key(raw_value: str) -> str:
    normalized = raw_value.strip().replace("\\n", "\n")
    normalized = normalized.replace("-----BEGIN RSA PRIVATE KEY-----", "")
    normalized = normalized.replace("-----END RSA PRIVATE KEY-----", "")
    return normalized.strip()


def _coerce_float(value: object, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (TypeError, ValueError):
        return default


def _coerce_int(value: object, default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@lru_cache(maxsize=1)
def get_tiger_quote_client() -> QuoteClient:
    config = TigerOpenClientConfig(sandbox_debug=False)
    config.tiger_id = _require_env("TIGER_ID")
    config.account = (os.getenv("TIGER_ACCOUNT", "") or os.getenv("tiger_account", "")).strip()
    config.license = ((os.getenv("TIGER_LICENSE", "") or os.getenv("tiger_license", "")).strip() or None)
    config.private_key = _normalize_private_key(_require_env("TIGER_PRIVATE_KEY_PK1"))
    config.language = Language.en_US
    return QuoteClient(config)


def _build_event(
    symbol: str,
    price: float,
    volume: int,
    timestamp: int,
    state: TigerStreamState,
    *,
    reference_price: float | None = None,
    chg_pct_override: float | None = None,
) -> QuoteEvent:
    if reference_price is not None and reference_price > 0:
        state.reference_price = reference_price
    resolved_reference_price = state.reference_price or price
    previous_price = state.last_price
    if chg_pct_override is not None:
        chg_pct = chg_pct_override
    else:
        chg_pct = ((price - resolved_reference_price) / resolved_reference_price) * 100 if resolved_reference_price else 0.0
    momentum = ((price - previous_price) / previous_price) * 1200 if previous_price else 0.0
    state.last_price = price
    state.last_emit_at = time.monotonic()
    state.last_timestamp_ms = timestamp
    return QuoteEvent(
        symbol=symbol,
        timestamp=timestamp,
        price=price,
        volume=max(0, volume),
        chgPct=chg_pct,
        momentum=momentum,
        preClose=resolved_reference_price,
    )


# Well-known futures type codes (used by Tiger get_current_future_contract)
_FUTURES_TYPES = {
    "CL", "GC", "SI", "HG", "NG", "ES", "NQ", "YM", "RTY",
    "ZB", "ZN", "ZF", "ZT", "ZC", "ZS", "ZW", "ZM", "ZL",
    "6E", "6J", "6B", "6A", "6C", "6S",
    "HSI", "MHI", "CN", "SGX",
}


def _is_futures(symbol: str) -> bool:
    """Heuristic: is the symbol a futures type code?"""
    s = symbol.upper().strip()
    if s in _FUTURES_TYPES:
        return True
    # Pattern like CL2507, ES2506, etc.
    if len(s) >= 4 and s[:2].isalpha() and s[2:].isdigit():
        return True
    return False


@lru_cache(maxsize=16)
def _resolve_futures_contract(future_type: str) -> str | None:
    """Resolve a bare futures type (e.g. 'CL') to the current main contract id (e.g. 'CL2605')."""
    try:
        client = get_tiger_quote_client()
        df = client.get_current_future_contract(future_type)
        if df is not None and not df.empty:
            row = df.iloc[0]
            return str(row.get("contract_code", "") or row.get("identifier", "")).strip() or None
    except Exception:
        pass
    return None


def _fetch_stock_brief(symbol: str):
    briefs = get_tiger_quote_client().get_stock_briefs([symbol], include_hour_trading=True)
    if briefs is None or briefs.empty:
        return None
    return briefs.iloc[0]


def _fetch_future_brief(contract_id: str):
    briefs = get_tiger_quote_client().get_future_brief([contract_id])
    if briefs is None or briefs.empty:
        return None
    return briefs.iloc[0]


def _fetch_brief(symbol: str) -> tuple:
    """Returns (brief_row, display_symbol). Auto-detects futures vs stocks."""
    upper = symbol.upper().strip()
    if _is_futures(upper):
        # If bare type like 'CL', resolve to main contract
        contract = upper
        if len(upper) <= 3 or not upper[2:].isdigit():
            resolved = _resolve_futures_contract(upper)
            if resolved:
                contract = resolved
        brief = _fetch_future_brief(contract)
        if brief is not None:
            return brief, upper  # display as 'CL' not 'CL2605'
    # Fallback: stock
    return _fetch_stock_brief(upper), upper


def _event_from_brief(symbol: str, brief, state: TigerStreamState, *, force_emit: bool) -> QuoteEvent | None:
    # Accept both stock rows (has 'symbol') and futures rows (has 'identifier')
    brief_symbol = str(getattr(brief, "symbol", "") or getattr(brief, "identifier", "")).upper()
    # For futures: display_symbol='CL' but brief has 'CL2605' — allow prefix match
    if brief_symbol and brief_symbol != symbol and not brief_symbol.startswith(symbol):
        return None

    price = _coerce_float(getattr(brief, "latest_price", None))
    if price <= 0:
        return None

    # For stocks: pre_close; for futures: settlement (结算价) as reference
    pre_close = _coerce_float(getattr(brief, "pre_close", None), 0.0)
    if pre_close <= 0:
        pre_close = _coerce_float(getattr(brief, "settlement", None), 0.0)
    if pre_close <= 0:
        pre_close = price

    total_volume = max(0, _coerce_int(getattr(brief, "volume", None)))
    previous_total = state.last_total_volume
    if previous_total is None:
        interval_volume = 0
    elif total_volume < previous_total:
        interval_volume = total_volume
    else:
        interval_volume = total_volume - previous_total

    state.last_total_volume = total_volume
    state.last_symbol = symbol

    timestamp = int(time.time() * 1000)
    if timestamp <= state.last_timestamp_ms:
        timestamp = state.last_timestamp_ms + 1

    if (
        not force_emit
        and interval_volume <= 0
        and state.last_price is not None
        and math.isclose(price, state.last_price, rel_tol=0.0, abs_tol=1e-6)
    ):
        return None

    # Use Tiger's own change_rate (ratio, e.g. -0.007281 = -0.7281%)
    raw_tiger_chg = getattr(brief, "change_rate", None)
    tiger_chg_pct: float | None = None
    if raw_tiger_chg is not None:
        v = _coerce_float(raw_tiger_chg)
        if v != 0.0 or math.isclose(price, pre_close, rel_tol=0, abs_tol=0.005):
            tiger_chg_pct = v * 100  # ratio → percentage

    return _build_event(
        symbol, price, max(0, interval_volume), timestamp, state,
        reference_price=pre_close,
        chg_pct_override=tiger_chg_pct,
    )


async def tiger_quote_stream(symbol: str) -> AsyncGenerator[QuoteEvent, None]:
    ticker = symbol.upper()
    state = TigerStreamState()

    while True:
        now = time.monotonic()
        brief = None
        display_symbol = ticker
        try:
            brief, display_symbol = await asyncio.to_thread(_fetch_brief, ticker)
        except Exception:
            # Network / API error – back off and retry
            state.last_brief_at = now
            await asyncio.sleep(2.0)
            continue
        finally:
            state.last_brief_at = now

        if brief is None:
            await asyncio.sleep(0.8)
            continue

        force_emit = time.monotonic() - state.last_emit_at >= 1.8
        event = _event_from_brief(display_symbol, brief, state, force_emit=force_emit)
        if event is not None:
            yield event

        await asyncio.sleep(0.35)


def choose_stream() -> str:
    return os.getenv("QUOTE_SOURCE", "mock").lower().strip()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "quoteSource": choose_stream()}


@app.get("/api/kline/{symbol}")
async def get_kline(symbol: str) -> dict:
    source = choose_stream()
    if source != "tiger":
        return {"bars": []}
    try:
        client = get_tiger_quote_client()
        ticker = symbol.strip().upper()
        bars = None

        # Use futures bars API if futures symbol
        if _is_futures(ticker):
            contract = ticker
            if len(ticker) <= 3 or not ticker[2:].isdigit():
                resolved = _resolve_futures_contract(ticker)
                if resolved:
                    contract = resolved
            bars = await asyncio.to_thread(
                client.get_future_bars,
                [contract],
                period=BarPeriod.ONE_MINUTE,
                limit=80,
            )
        else:
            bars = await asyncio.to_thread(
                client.get_bars,
                [ticker],
                period=BarPeriod.ONE_MINUTE,
                limit=80,
            )

        if bars is None or bars.empty:
            return {"bars": []}
        result = []
        for _, row in bars.iterrows():
            t = int(row.get("time", 0))
            o = float(row.get("open", 0))
            h = float(row.get("high", 0))
            lo = float(row.get("low", 0))
            c = float(row.get("close", 0))
            v = int(row.get("volume", 0))
            if o > 0 and h > 0:
                result.append({"time": t, "open": o, "high": h, "low": lo, "close": c, "volume": v})
        return {"bars": result}
    except Exception as exc:
        return {"bars": [], "error": str(exc)}


@app.websocket("/ws/quotes")
async def ws_quotes(websocket: WebSocket, symbol: str = Query("CL", min_length=1, max_length=20)) -> None:
    await websocket.accept()
    source = choose_stream()
    streamer = tiger_quote_stream if source == "tiger" else mock_quote_stream

    try:
        async for event in streamer(symbol):
            await websocket.send_json(event.as_dict())
    except Exception:
        pass  # Client disconnected or stream error
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# ── Serve frontend static build (if available) ─────────────────
_frontend_dist = _backend_root.parent / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_frontend_dist / "assets"), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file = _frontend_dist / full_path
        if full_path and file.is_file():
            return FileResponse(file)
        return FileResponse(_frontend_dist / "index.html")
