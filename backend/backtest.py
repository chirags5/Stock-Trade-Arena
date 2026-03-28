import yfinance as yf
import statistics
from datetime import datetime, timedelta

_cache = {}


def get_ohlcv(ticker):
    ticker = ticker.upper()
    if ticker in _cache:
        return _cache[ticker]

    end_date = datetime.today().strftime('%Y-%m-%d')
    df = None

    for years in [5, 3, 2, 1]:
        start_date = (datetime.today() - timedelta(days=365 * years)).strftime('%Y-%m-%d')
        try:
            df = yf.download(
                f"{ticker}.NS",
                start=start_date,
                end=end_date,
                interval="1d",
                progress=False,
                auto_adjust=True,
                actions=False,
            )
            if df is None or df.empty or len(df) < 30:
                df = yf.download(
                    ticker,
                    start=start_date,
                    end=end_date,
                    interval="1d",
                    progress=False,
                    auto_adjust=True,
                    actions=False,
                )
            if df is not None and not df.empty and len(df) >= 30:
                print(f"[Backtest] {ticker} - fetched {len(df)} days (~{years}yr)")
                break
        except Exception as e:
            print(f"[Backtest] {ticker} {years}yr fetch failed: {e}")
            df = None
            continue

    if df is None or df.empty or len(df) < 30:
        print(f"[Backtest] {ticker} - no usable data found")
        return None

    try:
        if hasattr(df.columns, 'levels'):
            df.columns = df.columns.get_level_values(0)

        rows = []
        for date, row in df.iterrows():
            try:
                rows.append({
                    "date":   str(date.date()),
                    "close":  float(row["Close"]),
                    "high":   float(row["High"]),
                    "low":    float(row["Low"]),
                    "volume": float(row["Volume"]),
                })
            except Exception:
                continue

        if len(rows) < 30:
            print(f"[Backtest] {ticker} - parsed rows < 30")
            return None

        unique_dates = len(set(r["date"] for r in rows))
        if unique_dates < 10:
            print(f"[WARN] {ticker} suspicious data - only {unique_dates} unique dates")
            return None

        _cache[ticker] = rows
        return rows

    except Exception as e:
        print(f"[Backtest] {ticker} parse error: {e}")
        return None


def run_backtest(ticker, pattern_name, initial_capital=100000, lookahead_days=5):
    rows = get_ohlcv(ticker)

    if not rows or len(rows) < 30:
        return None

    closes  = [r["close"]  for r in rows]
    lows    = [r["low"]    for r in rows]
    volumes = [r["volume"] for r in rows]
    dates   = [r["date"]   for r in rows]

    fn = PATTERN_FNS.get(pattern_name)
    if not fn:
        return None

    capital = initial_capital
    trades  = []
    equity  = [{"date": dates[0], "value": initial_capital}]

    for i in range(25, len(closes) - lookahead_days):
        c_slice = closes[:i+1]
        v_slice = volumes[:i+1]
        l_slice = lows[:i+1]

        if not fn(c_slice, v_slice, l_slice):
            continue

        entry   = closes[i]
        exit_   = closes[i + lookahead_days]
        qty     = max(1, int((capital * 0.10) / entry))

        if pattern_name == "Bearish Breakdown":
            pnl        = round((entry - exit_) * qty, 2)
            return_pct = round(((entry - exit_) / entry) * 100, 2)
        else:
            pnl        = round((exit_ - entry) * qty, 2)
            return_pct = round(((exit_ - entry) / entry) * 100, 2)

        capital += pnl

        trades.append({
            "date":          dates[i],
            "entry":         round(entry, 2),
            "exit":          round(exit_, 2),
            "qty":           qty,
            "pnl":           pnl,
            "return_pct":    return_pct,
            "capital_after": round(capital, 2),
        })
        equity.append({"date": dates[i + lookahead_days], "value": round(capital, 2)})

    if not trades:
        return {
            "ticker": ticker, "pattern": pattern_name,
            "data_from": dates[0],
            "data_to": dates[-1],
            "total_days": len(closes),
            "total_trades": 0, "win_rate": 0.0,
            "total_return_pct": 0.0, "max_drawdown_pct": 0.0,
            "avg_pnl": 0.0, "final_capital": initial_capital,
            "trades": [], "equity_curve": [],
        }

    wins         = [t for t in trades if t["pnl"] > 0]
    win_rate     = round(len(wins) / len(trades) * 100, 1)
    total_return = round((capital - initial_capital) / initial_capital * 100, 2)
    avg_pnl      = round(sum(t["pnl"] for t in trades) / len(trades), 2)

    peak, max_dd, running = initial_capital, 0.0, initial_capital
    for t in trades:
        running = t["capital_after"]
        peak    = max(peak, running)
        dd      = (peak - running) / peak * 100
        max_dd  = max(max_dd, dd)

    return {
        "ticker":           ticker,
        "pattern":          pattern_name,
        "data_from":        dates[0],
        "data_to":          dates[-1],
        "total_days":       len(closes),
        "total_trades":     len(trades),
        "win_rate":         win_rate,
        "total_return_pct": total_return,
        "max_drawdown_pct": round(max_dd, 2),
        "avg_pnl":          avg_pnl,
        "final_capital":    round(capital, 2),
        "trades":           trades[-40:],
        "equity_curve":     equity,
    }


# ── Pattern functions ──────────────────────────────────────────────────────────

def bullish_breakout_fn(closes, volumes, lows):
    if len(closes) < 22 or len(volumes) < 22:
        return False
    today_close  = closes[-1]
    today_volume = volumes[-1]
    highest_20d  = max(closes[-21:-1])
    avg_vol      = statistics.mean(volumes[-21:-1])
    return today_close > highest_20d and today_volume > avg_vol * 1.5


def support_bounce_fn(closes, volumes, lows):
    if len(closes) < 22 or len(lows) < 22:
        return False
    today_close  = closes[-1]
    yesterday    = closes[-2]
    today_low    = lows[-1]
    support      = min(lows[-21:-1])
    avg_vol      = statistics.mean(volumes[-21:-1])
    today_volume = volumes[-1]
    return (today_low <= support * 1.01) and (today_close > yesterday) and (today_volume > avg_vol * 1.2)


def bearish_breakdown_fn(closes, volumes, lows):
    if len(closes) < 22 or len(volumes) < 22:
        return False
    today_close  = closes[-1]
    today_volume = volumes[-1]
    lowest_20d   = min(closes[-21:-1])
    avg_vol      = statistics.mean(volumes[-21:-1])
    return today_close < lowest_20d and today_volume > avg_vol * 1.5


PATTERN_FNS = {
    "Bullish Flag Breakout": bullish_breakout_fn,
    "Support Bounce":        support_bounce_fn,
    "Bearish Breakdown":     bearish_breakdown_fn,
}


def get_win_rate(ticker, pattern_name):
    fn = PATTERN_FNS.get(pattern_name)
    if not fn:
        return 50.0, 0
    result = run_backtest(ticker, pattern_name)
    if not result:
        return 50.0, 0
    return result["win_rate"], result["total_trades"]
