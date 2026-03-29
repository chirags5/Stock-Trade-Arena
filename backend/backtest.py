import yfinance as yf
import statistics
import time
from datetime import datetime, timedelta

_cache = {}

BEARISH_PATTERNS = {"Bearish Breakdown", "Death Cross"}


def get_ohlcv(ticker):
    ticker = ticker.upper()
    if ticker in _cache:
        return _cache[ticker]

    end_date = datetime.today().strftime('%Y-%m-%d')
    df = None

    for years in [5, 3, 2, 1]:
        start_date = (datetime.today() - timedelta(days=365 * years)).strftime('%Y-%m-%d')
        try:
            # Retry up to 3 times to handle yfinance cold-start empty responses.
            for attempt in range(3):
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
                        break

                    print(f"[Backtest] {ticker} attempt {attempt + 1} returned empty, retrying...")
                    time.sleep(1.5)
                except Exception as e:
                    print(f"[Backtest] {ticker} attempt {attempt + 1} error: {e}")
                    time.sleep(1.5)
                    continue

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

        if pattern_name in BEARISH_PATTERNS:
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


# ── Helper functions ───────────────────────────────────────────────────────────

def _sma(series, n):
    if len(series) < n:
        return None
    return statistics.mean(series[-n:])


def _rsi(closes, period=14):
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [d if d > 0 else 0 for d in deltas[-period:]]
    losses = [-d if d < 0 else 0 for d in deltas[-period:]]
    avg_gain = statistics.mean(gains) if gains else 0
    avg_loss = statistics.mean(losses) if losses else 0
    if avg_loss == 0:
        return 100
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def _ema(series, n):
    if len(series) < n:
        return None
    k = 2 / (n + 1)
    ema = statistics.mean(series[:n])
    for price in series[n:]:
        ema = price * k + ema * (1 - k)
    return ema


def _ema_series(series, n):
    """Returns a list of EMA values for the full series."""
    if len(series) < n:
        return []
    k = 2 / (n + 1)
    ema = statistics.mean(series[:n])
    result = [ema]
    for price in series[n:]:
        ema = price * k + ema * (1 - k)
        result.append(ema)
    return result


def _macd(closes):
    if len(closes) < 35:
        return None, None
    ema12_series = _ema_series(closes, 12)
    ema26_series = _ema_series(closes, 26)
    if not ema12_series or not ema26_series:
        return None, None

    # Align: ema26 starts 14 candles later than ema12
    offset = len(ema12_series) - len(ema26_series)
    macd_series = [
        ema12_series[i + offset] - ema26_series[i]
        for i in range(len(ema26_series))
    ]
    if len(macd_series) < 9:
        return None, None

    signal_series = _ema_series(macd_series, 9)
    if not signal_series:
        return None, None

    return macd_series[-1], signal_series[-1]


# ── Strategy functions ─────────────────────────────────────────────────────────

def rsi_oversold_bounce_fn(closes, volumes, lows):
    """RSI was below 30 yesterday, crossed above 30 today -> buy."""
    if len(closes) < 20:
        return False
    rsi_today = _rsi(closes[-16:], 14)
    rsi_prev = _rsi(closes[-17:-1], 14)
    if rsi_today is None or rsi_prev is None:
        return False
    return rsi_prev < 30 and rsi_today >= 30


def golden_cross_fn(closes, volumes, lows):
    """50 SMA just crossed above 200 SMA."""
    if len(closes) < 202:
        return False
    sma50_today = _sma(closes, 50)
    sma200_today = _sma(closes, 200)
    sma50_prev = _sma(closes[:-1], 50)
    sma200_prev = _sma(closes[:-1], 200)
    if None in (sma50_today, sma200_today, sma50_prev, sma200_prev):
        return False
    return sma50_prev <= sma200_prev and sma50_today > sma200_today


def death_cross_fn(closes, volumes, lows):
    """50 SMA just crossed below 200 SMA -> short/bearish."""
    if len(closes) < 202:
        return False
    sma50_today = _sma(closes, 50)
    sma200_today = _sma(closes, 200)
    sma50_prev = _sma(closes[:-1], 50)
    sma200_prev = _sma(closes[:-1], 200)
    if None in (sma50_today, sma200_today, sma50_prev, sma200_prev):
        return False
    return sma50_prev >= sma200_prev and sma50_today < sma200_today


def macd_crossover_fn(closes, volumes, lows):
    """MACD line just crossed above signal line."""
    if len(closes) < 36:
        return False
    macd_now, signal_now = _macd(closes)
    macd_prev, signal_prev = _macd(closes[:-1])
    if None in (macd_now, signal_now, macd_prev, signal_prev):
        return False
    return macd_prev <= signal_prev and macd_now > signal_now


def bollinger_breakout_fn(closes, volumes, lows):
    """Close breaks above upper Bollinger Band (20,2) with above-avg volume."""
    if len(closes) < 21 or len(volumes) < 21:
        return False
    window = closes[-20:]
    mean = statistics.mean(window)
    std = statistics.stdev(window)
    upper = mean + 2 * std
    avg_vol = statistics.mean(volumes[-21:-1])
    return closes[-1] > upper and volumes[-1] > avg_vol * 1.3


PATTERN_FNS = {
    "Bullish Flag Breakout":  bullish_breakout_fn,
    "Support Bounce":         support_bounce_fn,
    "Bearish Breakdown":      bearish_breakdown_fn,
    # ── New strategies ──
    "RSI Oversold Bounce":    rsi_oversold_bounce_fn,
    "Golden Cross":           golden_cross_fn,
    "Death Cross":            death_cross_fn,
    "MACD Crossover":         macd_crossover_fn,
    "Bollinger Band Breakout": bollinger_breakout_fn,
}


def get_win_rate(ticker, pattern_name):
    fn = PATTERN_FNS.get(pattern_name)
    if not fn:
        return 50.0, 0
    result = run_backtest(ticker, pattern_name)
    if not result:
        return 50.0, 0
    return result["win_rate"], result["total_trades"]
