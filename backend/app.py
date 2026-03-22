import threading
import time
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import (
    init_db, get_cash_balance, update_cash_balance,
    save_signal, get_all_signals, update_signal_outcome,
    save_trade, close_trade, get_open_trades, get_all_trades,
    get_all_live_prices, get_live_price,
    get_leaderboard, update_leaderboard_realuser
)
from data_fetcher import fetch_live_prices
from patterns import detect_patterns_for_all_stocks
from ai_layer import process_signals

app = FastAPI(title="Paper Trade Arena API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request body models ───────────────────────────────────────────────────────

class TradeRequest(BaseModel):
    signal_id: int
    ticker:    str
    direction: str
    qty:       int
    buy_price: float


class ExitRequest(BaseModel):
    trade_id:   int
    sell_price: float


# ── Demo signals fallback ─────────────────────────────────────────────────────

def get_demo_signals():
    """
    Fallback demo signals when no real patterns detected today.
    Uses real current prices from the database.
    """
    demo = [
        {
            "ticker":     "RELIANCE",
            "stock_name": "Reliance Industries",
            "pattern":    "Bullish Flag Breakout",
            "direction":  "BUY",
            "price":      get_live_price("RELIANCE") or 1414.0,
            "details":    {"volume_ratio": 2.1},
        },
        {
            "ticker":     "HDFCBANK",
            "stock_name": "HDFC Bank",
            "pattern":    "Support Bounce",
            "direction":  "BUY",
            "price":      get_live_price("HDFCBANK") or 780.0,
            "details":    {"volume_ratio": 1.6},
        },
        {
            "ticker":     "INFY",
            "stock_name": "Infosys",
            "pattern":    "Bearish Breakdown",
            "direction":  "SHORT",
            "price":      get_live_price("INFY") or 1255.0,
            "details":    {"volume_ratio": 1.8},
        },
    ]
    return demo


# ── Background price refresh ──────────────────────────────────────────────────

def price_refresh_loop():
    while True:
        try:
            fetch_live_prices()
        except Exception as e:
            print(f"Price refresh error: {e}")
        time.sleep(60)


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()
    print("Database ready.")
    t = threading.Thread(target=price_refresh_loop, daemon=True)
    t.start()
    print("Price refresh thread started (every 60 seconds).")


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Paper Trade Arena API is running"}


@app.get("/signals")
def get_signals():
    """
    Detects today's patterns across all 8 stocks.
    If no real patterns found, uses cached DB signals.
    If no cached signals, uses demo signals for hackathon.
    Calls AI to generate explanations and saves to DB.
    """
    # Step 1: Try to detect real patterns
    raw_signals = detect_patterns_for_all_stocks()

    # Step 2: No real patterns today
    if not raw_signals:
        # Check if we have cached signals in DB already
        existing = get_all_signals()
        if existing:
            return {"signals": existing, "source": "cached"}
        # Nothing in DB either — use demo signals
        raw_signals = get_demo_signals()

    # Step 3: Enrich with AI explanations
    enriched = process_signals(raw_signals)

    # Step 4: Save to DB and attach IDs
    final = []
    for s in enriched:
        signal_id = save_signal(
            ticker      = s["ticker"],
            stock_name  = s["stock_name"],
            pattern     = s["pattern"],
            direction   = s["direction"],
            price       = s["price"],
            win_rate    = s["win_rate"],
            conviction  = s["conviction"],
            explanation = s["explanation"],
        )
        s["id"] = signal_id
        final.append(s)

    return {"signals": final, "source": "fresh"}


@app.get("/prices")
def get_prices():
    """Returns latest live prices for all stocks."""
    prices = get_all_live_prices()
    return {"prices": prices}


@app.get("/portfolio")
def get_portfolio():
    """
    Returns cash balance + all open positions with live P&L.
    """
    cash        = get_cash_balance()
    open_trades = get_open_trades()
    live_prices = get_all_live_prices()

    holdings    = []
    total_value = cash

    for trade in open_trades:
        ticker    = trade["ticker"]
        ltp       = live_prices.get(ticker, trade["buy_price"])
        direction = trade["direction"]

        if direction == "BUY":
            unrealised_pnl = (ltp - trade["buy_price"]) * trade["qty"]
        else:
            unrealised_pnl = (trade["buy_price"] - ltp) * trade["qty"]

        position_value = trade["buy_price"] * trade["qty"]
        total_value   += position_value + unrealised_pnl

        holdings.append({
            "trade_id":       trade["id"],
            "ticker":         ticker,
            "direction":      direction,
            "qty":            trade["qty"],
            "buy_price":      trade["buy_price"],
            "current_price":  round(ltp, 2),
            "unrealised_pnl": round(unrealised_pnl, 2),
            "return_pct":     round((unrealised_pnl / position_value) * 100, 2),
            "pattern":        trade.get("pattern", ""),
            "explanation":    trade.get("explanation", ""),
        })

    overall_pnl     = total_value - 1000000
    overall_pnl_pct = round((overall_pnl / 1000000) * 100, 2)

    update_leaderboard_realuser(round(total_value, 2))

    return {
        "cash_balance":     round(cash, 2),
        "holdings":         holdings,
        "total_value":      round(total_value, 2),
        "overall_pnl":      round(overall_pnl, 2),
        "overall_pnl_pct":  overall_pnl_pct,
        "starting_capital": 1000000,
    }


@app.post("/trade")
def place_trade(req: TradeRequest):
    """User clicks Buy — deduct cash, save trade."""
    cash = get_cash_balance()
    cost = req.qty * req.buy_price

    if cost > cash:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough cash. Need ₹{cost:.0f}, have ₹{cash:.0f}"
        )

    new_cash = cash - cost
    update_cash_balance(new_cash)

    trade_id = save_trade(
        signal_id = req.signal_id,
        ticker    = req.ticker,
        direction = req.direction,
        qty       = req.qty,
        buy_price = req.buy_price,
    )

    return {
        "success":        True,
        "trade_id":       trade_id,
        "cash_remaining": round(new_cash, 2),
        "message":        f"Bought {req.qty} × {req.ticker} @ ₹{req.buy_price}"
    }


@app.post("/exit")
def exit_trade(req: ExitRequest):
    """User clicks Exit — close position, calculate P&L."""
    open_trades = get_open_trades()
    trade = next((t for t in open_trades if t["id"] == req.trade_id), None)

    if not trade:
        raise HTTPException(
            status_code=404,
            detail="Trade not found or already closed"
        )

    pnl = close_trade(req.trade_id, req.sell_price)

    proceeds     = trade["buy_price"] * trade["qty"] + pnl
    current_cash = get_cash_balance()
    update_cash_balance(current_cash + proceeds)

    is_hit = pnl > 0
    update_signal_outcome(trade["signal_id"], "HIT" if is_hit else "MISS")

    return {
        "success": True,
        "pnl":     round(pnl, 2),
        "outcome": "HIT" if is_hit else "MISS",
        "message": f"Exited {trade['ticker']}. P&L: ₹{pnl:+.2f}"
    }


@app.get("/audit")
def get_audit():
    """Returns full trade history with AI reasoning attached."""
    trades   = get_all_trades()
    closed   = [t for t in trades if t["status"] == "CLOSED"]
    hits     = [t for t in closed if t.get("pnl", 0) > 0]
    accuracy = round(len(hits) / len(closed) * 100, 1) if closed else None

    return {
        "trades":       trades,
        "accuracy":     accuracy,
        "total_closed": len(closed),
        "total_hits":   len(hits),
    }


@app.get("/leaderboard")
def get_leaderboard_route():
    """Returns all users ranked by portfolio value."""
    rows = get_leaderboard()
    return {"leaderboard": rows}


# ── Run ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
