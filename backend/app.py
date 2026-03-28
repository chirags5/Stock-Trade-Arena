import threading
import time
import requests
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import (
    init_db, get_cash_balance, update_cash_balance,
    save_trade, close_trade, get_open_trades, get_all_trades,
    get_all_live_prices, get_live_price,
    get_leaderboard, update_leaderboard_realuser,
    get_monitored_open_trades, auto_close_trade, update_trade_thresholds,
)
from data_fetcher import (
    fetch_live_prices, fetch_price_for_ticker, load_nse_stocks
)


# ── Request models ────────────────────────────────────────────────────────────

class TradeRequest(BaseModel):
    ticker:    str
    direction: str
    qty:       int
    buy_price: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


class ExitRequest(BaseModel):
    trade_id:   int
    sell_price: float


class ThresholdRequest(BaseModel):
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


# ── Scanner request models ────────────────────────────────────────────────────

class WatchlistAddRequest(BaseModel):
    ticker: str
    name:   str = ""


class NotifierConfigRequest(BaseModel):
    telegram_token:   str  = ""
    telegram_chat_id: str  = ""
    email_enabled:    bool = False
    email_sender:     str  = ""
    email_password:   str  = ""        # Only updated if non-empty and not masked
    email_recipients: List[str] = []


# ── Nifty 500 — fetched live from NSE, refreshed every 24 hours ───────────────

_NIFTY500_CACHE      = []
_NIFTY500_LAST_FETCH = 0


def fetch_nifty500_tickers() -> list:
    global _NIFTY500_CACHE, _NIFTY500_LAST_FETCH

    if _NIFTY500_CACHE and (time.time() - _NIFTY500_LAST_FETCH) < 86400:
        return _NIFTY500_CACHE

    print("Fetching Nifty 500 constituents from NSE...", end=" ", flush=True)
    try:
        session = requests.Session()
        session.headers.update({
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                               "AppleWebKit/537.36 (KHTML, like Gecko) "
                               "Chrome/120.0.0.0 Safari/537.36",
            "Accept":          "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer":         "https://www.nseindia.com/",
        })
        session.get("https://www.nseindia.com", timeout=10)
        res = session.get(
            "https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20500",
            timeout=15
        )
        res.raise_for_status()
        data = res.json()

        tickers = []
        for item in data.get("data", []):
            symbol = item.get("symbol", "").strip()
            if symbol and symbol != "NIFTY 500":
                tickers.append(symbol)

        if len(tickers) >= 400:
            _NIFTY500_CACHE      = tickers
            _NIFTY500_LAST_FETCH = time.time()
            print(f"{len(tickers)} constituents loaded ✓")
            return _NIFTY500_CACHE
        else:
            raise ValueError(f"Only got {len(tickers)} tickers")

    except Exception as e:
        print(f"NSE API failed: {e}")

    # ── Fallback: NSE CSV ─────────────────────────────────────────────────────
    print("Trying NSE CSV for Nifty 500...", end=" ", flush=True)
    try:
        import pandas as pd
        from io import StringIO

        session2 = requests.Session()
        session2.headers.update({
            "User-Agent": "Mozilla/5.0",
            "Referer":    "https://www.nseindia.com/",
        })
        session2.get("https://www.nseindia.com", timeout=10)
        csv_res = session2.get(
            "https://archives.nseindia.com/content/indices/ind_nifty500list.csv",
            timeout=15
        )
        csv_res.raise_for_status()
        df  = pd.read_csv(StringIO(csv_res.text))
        col = next((c for c in df.columns if "symbol" in c.lower()), None)
        if col:
            tickers = df[col].str.strip().tolist()
            _NIFTY500_CACHE      = tickers
            _NIFTY500_LAST_FETCH = time.time()
            print(f"{len(tickers)} from CSV ✓")
            return _NIFTY500_CACHE
    except Exception as e:
        print(f"CSV fallback failed: {e}")

    if _NIFTY500_CACHE:
        print("Using stale Nifty 500 cache.")
        return _NIFTY500_CACHE

    print("Using hardcoded Nifty 50 as fallback.")
    return [
        "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
        "HINDUNILVR", "SBIN", "BAJFINANCE", "KOTAKBANK", "BHARTIARTL",
        "ITC", "AXISBANK", "LT", "ASIANPAINT", "MARUTI",
        "SUNPHARMA", "TITAN", "ULTRACEMCO", "HCLTECH", "WIPRO",
        "NESTLEIND", "TECHM", "NTPC", "POWERGRID", "TATAMOTORS",
        "TATASTEEL", "ADANIPORTS", "JSWSTEEL", "ONGC", "COALINDIA",
        "GRASIM", "BPCL", "DRREDDY", "CIPLA", "EICHERMOT",
        "DIVISLAB", "HEROMOTOCO", "SBILIFE", "HDFCLIFE", "BRITANNIA",
        "APOLLOHOSP", "BAJAJFINSV", "ADANIENT", "INDUSINDBK",
        "TATACONSUM", "SHREECEM", "UPL", "ZOMATO", "HINDALCO", "MM",
    ]


# ── Fuzzy search ──────────────────────────────────────────────────────────────

def fuzzy_search_stocks(query: str, all_stocks: dict, limit: int = 20):
    query_up    = query.upper().strip()
    results     = []
    suggestions = []

    try:
        from rapidfuzz import process, fuzz

        corpus_tickers = list(all_stocks.keys())
        corpus_names   = [info["name"] for info in all_stocks.values()]

        ticker_matches = process.extract(
            query_up, corpus_tickers,
            scorer=fuzz.partial_ratio, limit=limit, score_cutoff=60
        )
        matched = set()
        for match, score, _ in ticker_matches:
            matched.add(match)
            results.append({
                "ticker":      match,
                **all_stocks[match],
                "match_score": score,
                "match_type":  "ticker",
            })

        name_matches = process.extract(
            query_up,
            [n.upper() for n in corpus_names],
            scorer=fuzz.partial_ratio, limit=limit, score_cutoff=60
        )
        for match, score, idx in name_matches:
            ticker = corpus_tickers[idx]
            if ticker not in matched:
                matched.add(ticker)
                results.append({
                    "ticker":      ticker,
                    **all_stocks[ticker],
                    "match_score": score,
                    "match_type":  "name",
                })

        results.sort(key=lambda x: x["match_score"], reverse=True)
        results = results[:limit]

        if results and results[0]["match_score"] < 95:
            top = results[0]
            suggestions.append({
                "ticker": top["ticker"],
                "name":   top["name"],
                "score":  top["match_score"],
            })

    except ImportError:
        for ticker, info in all_stocks.items():
            if query_up in ticker or query_up in info["name"].upper():
                results.append({"ticker": ticker, **info, "match_type": "partial"})
                if len(results) >= limit:
                    break

    return results, suggestions


# ── Background threads ────────────────────────────────────────────────────────

def price_refresh_loop():
    while True:
        try:
            fetch_live_prices()
        except Exception as e:
            print(f"Price refresh error: {e}")
        time.sleep(60)


def nifty500_refresh_loop():
    while True:
        time.sleep(86400)
        try:
            global _NIFTY500_LAST_FETCH
            _NIFTY500_LAST_FETCH = 0
            fetch_nifty500_tickers()
            print("Nifty 500 list refreshed.")
        except Exception as e:
            print(f"Nifty 500 refresh error: {e}")


def monitor_sl_tp_loop():
    import yfinance as yf

    while True:
        try:
            open_trades = get_monitored_open_trades()

            for trade in open_trades:
                trade_id    = trade["id"]
                ticker      = trade["ticker"]
                direction   = trade["direction"]
                qty         = trade["qty"]
                buy_price   = trade["buy_price"]
                stop_loss   = trade.get("stop_loss")
                take_profit = trade.get("take_profit")

                try:
                    df = yf.download(
                        f"{ticker}.NS",
                        period="1d",
                        interval="1m",
                        progress=False,
                        auto_adjust=True,
                        actions=False,
                    )
                    if df.empty:
                        continue

                    if hasattr(df.columns, 'levels'):
                        df.columns = df.columns.get_level_values(0)

                    price        = float(df["Close"].dropna().iloc[-1])
                    triggered    = False
                    exit_reason  = ""

                    if direction == "BUY":
                        if stop_loss is not None and price <= stop_loss:
                            triggered   = True
                            exit_reason = "Stop Loss"
                        elif take_profit is not None and price >= take_profit:
                            triggered   = True
                            exit_reason = "Take Profit"
                    else:
                        if stop_loss is not None and price >= stop_loss:
                            triggered   = True
                            exit_reason = "Stop Loss"
                        elif take_profit is not None and price <= take_profit:
                            triggered   = True
                            exit_reason = "Take Profit"

                    if not triggered:
                        continue

                    sell_price = round(price, 2)
                    pnl        = round((sell_price - buy_price) * qty, 2) if direction == "BUY" \
                                 else round((buy_price - sell_price) * qty, 2)

                    auto_close_trade(trade_id, sell_price, pnl)
                    proceeds = buy_price * qty + pnl
                    update_cash_balance(get_cash_balance() + proceeds)
                    print(f"[AUTO EXIT] {ticker} #{trade_id} - {exit_reason} @ ₹{sell_price}")

                except Exception as e:
                    print(f"[Monitor] {ticker} error: {e}")

        except Exception as e:
            print(f"[Monitor thread] error: {e}")

        time.sleep(30)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    print("Database ready.")
    load_nse_stocks()
    fetch_nifty500_tickers()
    threading.Thread(target=price_refresh_loop,    daemon=True).start()
    threading.Thread(target=nifty500_refresh_loop, daemon=True).start()
    threading.Thread(target=fetch_live_prices,     daemon=True).start()
    threading.Thread(target=monitor_sl_tp_loop,    daemon=True).start()

    # ── Scanner background thread ─────────────────────────────
    from scanner import scanner_loop
    threading.Thread(target=scanner_loop, args=(15,), daemon=True).start()
    print("Background threads started (incl. Pattern Scanner).")
    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Paper Trade Arena API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════
#  EXISTING ROUTES  (unchanged)
# ══════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"message": "Paper Trade Arena API is running"}


@app.get("/nifty500")
def get_nifty500():
    tickers = fetch_nifty500_tickers()
    return {"tickers": tickers, "count": len(tickers)}


@app.get("/stocks")
def get_stocks(search: str = ""):
    all_stocks  = load_nse_stocks()
    prices      = get_all_live_prices()
    suggestions = []

    if not search or len(search.strip()) < 2:
        nifty500 = fetch_nifty500_tickers()
        stocks = []
        for ticker in nifty500:
            info = all_stocks.get(ticker, {})
            stocks.append({
                "ticker": ticker,
                "name":   info.get("name", ticker),
                "sector": info.get("sector", "NSE"),
                "price":  prices.get(ticker, None),
            })
        return {
            "stocks":      stocks,
            "total":       len(stocks),
            "mode":        "nifty500",
            "suggestions": [],
        }

    results, suggestions = fuzzy_search_stocks(search, all_stocks, limit=20)

    for r in results[:10]:
        if r["ticker"] not in prices:
            price = fetch_price_for_ticker(r["ticker"])
            if price:
                prices[r["ticker"]] = price

    stocks = [{
        "ticker":     r["ticker"],
        "name":       r["name"],
        "sector":     r.get("sector", "NSE"),
        "price":      prices.get(r["ticker"], None),
        "match_type": r.get("match_type", ""),
    } for r in results]

    return {
        "stocks":      stocks,
        "total":       len(stocks),
        "mode":        "search",
        "suggestions": suggestions,
    }


@app.get("/prices")
def get_prices():
    return {"prices": get_all_live_prices()}


@app.get("/portfolio")
def get_portfolio():
    cash        = get_cash_balance()
    open_trades = get_open_trades()
    live_prices = get_all_live_prices()
    all_stocks  = load_nse_stocks()

    holdings    = []
    total_value = cash

    for trade in open_trades:
        ticker         = trade["ticker"]
        ltp            = live_prices.get(ticker, trade["buy_price"])
        direction      = trade["direction"]
        unrealised_pnl = (ltp - trade["buy_price"]) * trade["qty"] if direction == "BUY" \
                         else (trade["buy_price"] - ltp) * trade["qty"]
        position_value = trade["buy_price"] * trade["qty"]
        total_value   += position_value + unrealised_pnl

        holdings.append({
            "trade_id":       trade["id"],
            "ticker":         ticker,
            "name":           all_stocks.get(ticker, {}).get("name", ticker),
            "direction":      direction,
            "qty":            trade["qty"],
            "buy_price":      trade["buy_price"],
            "current_price":  round(ltp, 2),
            "unrealised_pnl": round(unrealised_pnl, 2),
            "return_pct":     round((unrealised_pnl / position_value) * 100, 2),
            "stop_loss":      trade.get("stop_loss"),
            "take_profit":    trade.get("take_profit"),
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
    all_stocks = load_nse_stocks()
    if req.ticker not in all_stocks:
        raise HTTPException(status_code=400, detail=f"Ticker {req.ticker} not found in NSE stock list")
    if req.qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")

    cash = get_cash_balance()
    cost = req.qty * req.buy_price
    if cost > cash:
        raise HTTPException(status_code=400, detail=f"Not enough cash. Need ₹{cost:.0f}, have ₹{cash:.0f}")

    update_cash_balance(cash - cost)
    trade_id = save_trade(
        ticker=req.ticker, direction=req.direction, qty=req.qty,
        buy_price=req.buy_price, signal_id=None,
        stop_loss=req.stop_loss, take_profit=req.take_profit,
    )

    return {
        "success":        True,
        "trade_id":       trade_id,
        "cash_remaining": round(cash - cost, 2),
        "message":        f"{req.direction} {req.qty} × {req.ticker} @ ₹{req.buy_price}",
    }


@app.post("/exit")
def exit_trade(req: ExitRequest):
    open_trades = get_open_trades()
    trade = next((t for t in open_trades if t["id"] == req.trade_id), None)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found or already closed")

    pnl      = close_trade(req.trade_id, req.sell_price)
    proceeds = trade["buy_price"] * trade["qty"] + pnl
    update_cash_balance(get_cash_balance() + proceeds)

    return {
        "success": True,
        "pnl":     round(pnl, 2),
        "outcome": "PROFIT" if pnl > 0 else "LOSS",
        "message": f"Exited {trade['ticker']}. P&L: ₹{pnl:+.2f}",
    }


@app.put("/thresholds/{trade_id}")
def set_thresholds(trade_id: int, req: ThresholdRequest):
    changed = update_trade_thresholds(trade_id=trade_id, stop_loss=req.stop_loss, take_profit=req.take_profit)
    if changed == 0:
        raise HTTPException(status_code=404, detail="Open trade not found")
    return {"status": "ok"}


@app.get("/audit")
def get_audit():
    trades   = get_all_trades()
    closed   = [t for t in trades if t["status"] == "CLOSED"]
    hits     = [t for t in closed if (t.get("pnl") or 0) > 0]
    accuracy = round(len(hits) / len(closed) * 100, 1) if closed else None
    return {
        "trades":       trades,
        "accuracy":     accuracy,
        "total_closed": len(closed),
        "total_hits":   len(hits),
    }


@app.get("/leaderboard")
def get_leaderboard_route():
    return {"leaderboard": get_leaderboard()}


@app.get("/price/{ticker}")
def get_single_price(ticker: str):
    ticker = ticker.upper()
    cached = get_live_price(ticker)
    if cached:
        return {"ticker": ticker, "price": cached, "source": "cache"}
    price = fetch_price_for_ticker(ticker)
    if price:
        return {"ticker": ticker, "price": price, "source": "live"}
    raise HTTPException(status_code=404, detail=f"Could not fetch price for {ticker}")


@app.get("/backtest/{ticker}")
def backtest_endpoint(ticker: str, pattern: str = "Bullish Flag Breakout"):
    from backtest import run_backtest
    result = run_backtest(ticker.upper(), pattern)
    if not result:
        raise HTTPException(status_code=404, detail="Not enough historical data for this stock.")
    return result


# ══════════════════════════════════════════════════════════════
#  SCANNER ROUTES  (new)
# ══════════════════════════════════════════════════════════════

# ── Watchlist ─────────────────────────────────────────────────

@app.get("/watchlist")
def get_watchlist():
    from scanner import load_watchlist, MAX_WATCHLIST
    stocks = load_watchlist()
    prices = get_all_live_prices()
    # Attach live price to each watchlist stock
    for s in stocks:
        t = s["ticker"]
        s["price"] = prices.get(t) or fetch_price_for_ticker(t)
    return {
        "watchlist": stocks,
        "count":     len(stocks),
        "max":       MAX_WATCHLIST,
    }


@app.post("/watchlist")
def add_watchlist_stock(req: WatchlistAddRequest):
    from scanner import add_to_watchlist
    ticker = req.ticker.upper().strip()
    all_stocks = load_nse_stocks()

    # Resolve name from NSE stock list if not provided
    name = req.name or all_stocks.get(ticker, {}).get("name", ticker)

    result = add_to_watchlist(ticker, name)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.delete("/watchlist/{ticker}")
def remove_watchlist_stock(ticker: str):
    from scanner import remove_from_watchlist
    result = remove_from_watchlist(ticker.upper())
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ── Scanner alerts ────────────────────────────────────────────

@app.get("/scanner/alerts")
def get_scanner_alerts(limit: int = 100):
    from scanner import get_recent_alerts
    alerts = get_recent_alerts(limit)
    return {"alerts": alerts, "count": len(alerts)}


@app.delete("/scanner/alerts")
def clear_scanner_alerts():
    from scanner import clear_alerts
    clear_alerts()
    return {"success": True, "message": "All alerts cleared"}


@app.post("/scanner/run")
def manual_scan():
    """Trigger an immediate scan of the watchlist (ignores market hours)."""
    from scanner import load_watchlist, scan_ticker, _persist_alerts
    from notifier import send_alert

    watchlist  = load_watchlist()
    if not watchlist:
        return {"alerts": [], "message": "Watchlist is empty — add stocks first"}

    all_alerts = []
    for stock in watchlist:
        ticker = stock["ticker"]
        name   = stock.get("name", ticker)
        alerts = scan_ticker(ticker, name)
        all_alerts.extend(alerts)
        for alert in alerts:
            try:
                send_alert(
                    ticker       = alert["ticker"],
                    name         = alert["name"],
                    pattern_name = alert["pattern"],
                    direction    = alert["direction"],
                    details      = alert["details"],
                    price        = alert["price"],
                    category     = alert["category"],
                )
            except Exception as e:
                print(f"[Notifier] {e}")

    _persist_alerts(all_alerts)
    return {
        "alerts":  all_alerts,
        "count":   len(all_alerts),
        "message": f"Scanned {len(watchlist)} stock(s) — {len(all_alerts)} pattern(s) found",
    }


# ── Notifier config ───────────────────────────────────────────

@app.get("/scanner/config")
def get_notifier_config():
    from notifier import get_safe_config
    return get_safe_config()


@app.post("/scanner/config")
def update_notifier_config(req: NotifierConfigRequest):
    from notifier import load_config, save_config
    existing = load_config()

    updated = {
        "telegram_token":   req.telegram_token   or existing.get("telegram_token", ""),
        "telegram_chat_id": req.telegram_chat_id or existing.get("telegram_chat_id", ""),
        "email_enabled":    req.email_enabled,
        "email_sender":     req.email_sender     or existing.get("email_sender", ""),
        "email_recipients": req.email_recipients or existing.get("email_recipients", []),
        # Only update password if user provided a real one (not masked placeholder)
        "email_password":   req.email_password
                            if req.email_password and req.email_password != "••••••••"
                            else existing.get("email_password", ""),
    }
    save_config(updated)
    return {"success": True, "message": "Config saved"}


@app.post("/scanner/test-telegram")
def test_telegram_notification():
    from notifier import test_telegram
    return test_telegram()


@app.post("/scanner/test-email")
def test_email_notification():
    from notifier import test_email
    return test_email()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)