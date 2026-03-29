"""
scanner.py — Pattern detection engine for NSE stocks (15-minute timeframe).
Detects: Candlestick patterns, Chart patterns, S/R Breakouts.
Called by app.py background thread every 15 minutes during market hours.

FINAL SIGNAL ENGINE: All detected patterns are scored and conflict-resolved
into ONE final BUY / SELL / NEUTRAL signal per stock before alerting.
"""

import json
import os
import time
import threading
from datetime import datetime, time as dtime
import yfinance as yf
import numpy as np
import pytz

WATCHLIST_FILE = "watchlist.json"
ALERTS_FILE    = "alerts.json"
CONFIG_FILE    = "notifier_config.json"
MAX_WATCHLIST  = 10

_alerts_lock = threading.Lock()

IST          = pytz.timezone("Asia/Kolkata")
MARKET_OPEN  = dtime(9, 15)
MARKET_CLOSE = dtime(15, 30)


def _to_float(value, default=None):
    """Safely coerce scalar-like yfinance outputs to float."""
    try:
        if value is None:
            return default
        if isinstance(value, (int, float, np.integer, np.floating)):
            return float(value)
        if hasattr(value, "iloc"):
            return _to_float(value.iloc[-1], default)
        if isinstance(value, (list, tuple, np.ndarray)):
            if len(value) == 0:
                return default
            return _to_float(value[-1], default)
        return float(value)
    except Exception:
        return default


# ══════════════════════════════════════════════════════════════
#  WATCHLIST CRUD
# ══════════════════════════════════════════════════════════════

def load_watchlist() -> list:
    if os.path.exists(WATCHLIST_FILE):
        try:
            with open(WATCHLIST_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return []


def save_watchlist(stocks: list):
    with open(WATCHLIST_FILE, "w") as f:
        json.dump(stocks, f, indent=2)


def add_to_watchlist(ticker: str, name: str = "") -> dict:
    stocks = load_watchlist()
    if len(stocks) >= MAX_WATCHLIST:
        return {"success": False, "error": f"Watchlist is full (max {MAX_WATCHLIST} stocks)"}
    if any(s["ticker"] == ticker for s in stocks):
        return {"success": False, "error": f"{ticker} is already in your watchlist"}
    stocks.append({
        "ticker":   ticker,
        "name":     name or ticker,
        "added_at": datetime.now().isoformat(),
    })
    save_watchlist(stocks)
    return {"success": True, "watchlist": stocks}


def remove_from_watchlist(ticker: str) -> dict:
    stocks = load_watchlist()
    new = [s for s in stocks if s["ticker"] != ticker]
    if len(new) == len(stocks):
        return {"success": False, "error": f"{ticker} not found in watchlist"}
    save_watchlist(new)
    return {"success": True, "watchlist": new}


# ══════════════════════════════════════════════════════════════
#  DATA FETCH
# ══════════════════════════════════════════════════════════════

def fetch_ohlcv(ticker: str, period: str = "5d", interval: str = "15m"):
    try:
        t = yf.Ticker(f"{ticker}.NS")
        df = t.history(period=period, interval=interval, auto_adjust=True)
        if df is None or df.empty:
            return None
        df = df.dropna()
        if len(df) < 20:
            return None
        return df
    except Exception as e:
        print(f"[Scanner] Fetch error {ticker}: {e}")
        return None


# ══════════════════════════════════════════════════════════════
#  CANDLESTICK PATTERNS
# ══════════════════════════════════════════════════════════════

def detect_doji(df):
    c = df.iloc[-1]
    body  = abs(float(c["Close"]) - float(c["Open"]))
    total = float(c["High"]) - float(c["Low"])
    if total == 0:
        return None
    if body / total < 0.08:
        return {
            "pattern":   "Doji",
            "direction": "NEUTRAL",
            "details":   f"Indecision candle at ₹{float(c['Close']):.2f} — watch for next candle direction",
        }
    return None


def detect_hammer(df):
    if len(df) < 5:
        return None
    c          = df.iloc[-1]
    open_, close_ = float(c["Open"]), float(c["Close"])
    high_, low_   = float(c["High"]),  float(c["Low"])
    body        = abs(close_ - open_)
    lower_wick  = min(close_, open_) - low_
    upper_wick  = high_ - max(close_, open_)
    total       = high_ - low_
    if total == 0 or body == 0:
        return None
    prior_trend = df["Close"].iloc[-6:-1].is_monotonic_decreasing or \
                  (df["Close"].iloc[-6] > df["Close"].iloc[-2])
    if lower_wick >= 2 * body and upper_wick <= body * 0.5 and prior_trend:
        return {
            "pattern":   "Hammer",
            "direction": "BUY",
            "details":   f"Bullish reversal candle — lower wick {lower_wick/body:.1f}× body at ₹{close_:.2f}",
        }
    return None


def detect_inverted_hammer(df):
    if len(df) < 5:
        return None
    c          = df.iloc[-1]
    open_, close_ = float(c["Open"]), float(c["Close"])
    high_, low_   = float(c["High"]),  float(c["Low"])
    body       = abs(close_ - open_)
    upper_wick = high_ - max(close_, open_)
    lower_wick = min(close_, open_) - low_
    if body == 0:
        return None
    if upper_wick >= 2 * body and lower_wick <= body * 0.5:
        return {
            "pattern":   "Inverted Hammer",
            "direction": "BUY",
            "details":   f"Potential bullish reversal at ₹{close_:.2f} — confirm with next candle",
        }
    return None


def detect_shooting_star(df):
    if len(df) < 5:
        return None
    c          = df.iloc[-1]
    open_, close_ = float(c["Open"]), float(c["Close"])
    high_, low_   = float(c["High"]),  float(c["Low"])
    body       = abs(close_ - open_)
    upper_wick = high_ - max(close_, open_)
    lower_wick = min(close_, open_) - low_
    total      = high_ - low_
    if total == 0 or body == 0:
        return None
    prior_uptrend = df["Close"].iloc[-6] < df["Close"].iloc[-2]
    if upper_wick >= 2 * body and lower_wick <= body * 0.3 and prior_uptrend:
        return {
            "pattern":   "Shooting Star",
            "direction": "SELL",
            "details":   f"Bearish rejection at ₹{close_:.2f} — sellers overwhelmed buyers",
        }
    return None


def detect_bullish_engulfing(df):
    if len(df) < 3:
        return None
    prev, curr = df.iloc[-2], df.iloc[-1]
    p_open, p_close = float(prev["Open"]), float(prev["Close"])
    c_open, c_close = float(curr["Open"]), float(curr["Close"])
    if p_close < p_open and c_close > c_open:
        if c_open <= p_close and c_close >= p_open:
            return {
                "pattern":   "Bullish Engulfing",
                "direction": "BUY",
                "details":   f"Bulls fully absorbed bearish candle at ₹{c_close:.2f}",
            }
    return None


def detect_bearish_engulfing(df):
    if len(df) < 3:
        return None
    prev, curr = df.iloc[-2], df.iloc[-1]
    p_open, p_close = float(prev["Open"]), float(prev["Close"])
    c_open, c_close = float(curr["Open"]), float(curr["Close"])
    if p_close > p_open and c_close < c_open:
        if c_open >= p_close and c_close <= p_open:
            return {
                "pattern":   "Bearish Engulfing",
                "direction": "SELL",
                "details":   f"Bears fully absorbed bullish candle at ₹{c_close:.2f}",
            }
    return None


def detect_morning_star(df):
    if len(df) < 4:
        return None
    c1, c2, c3 = df.iloc[-3], df.iloc[-2], df.iloc[-1]
    bearish1   = float(c1["Close"]) < float(c1["Open"])
    body2      = abs(float(c2["Close"]) - float(c2["Open"]))
    body1      = abs(float(c1["Close"]) - float(c1["Open"]))
    small2     = body2 < body1 * 0.35
    bullish3   = float(c3["Close"]) > float(c3["Open"])
    recovery   = float(c3["Close"]) > (float(c1["Open"]) + float(c1["Close"])) / 2
    if bearish1 and small2 and bullish3 and recovery:
        return {
            "pattern":   "Morning Star",
            "direction": "BUY",
            "details":   f"3-candle bullish reversal confirmed at ₹{float(c3['Close']):.2f}",
        }
    return None


def detect_evening_star(df):
    if len(df) < 4:
        return None
    c1, c2, c3 = df.iloc[-3], df.iloc[-2], df.iloc[-1]
    bullish1   = float(c1["Close"]) > float(c1["Open"])
    body2      = abs(float(c2["Close"]) - float(c2["Open"]))
    body1      = abs(float(c1["Close"]) - float(c1["Open"]))
    small2     = body2 < body1 * 0.35
    bearish3   = float(c3["Close"]) < float(c3["Open"])
    decline    = float(c3["Close"]) < (float(c1["Open"]) + float(c1["Close"])) / 2
    if bullish1 and small2 and bearish3 and decline:
        return {
            "pattern":   "Evening Star",
            "direction": "SELL",
            "details":   f"3-candle bearish reversal confirmed at ₹{float(c3['Close']):.2f}",
        }
    return None


# ══════════════════════════════════════════════════════════════
#  CHART PATTERNS
# ══════════════════════════════════════════════════════════════

def detect_bull_flag(df, window: int = 25):
    if len(df) < window:
        return None
    pole  = df.iloc[-window:-window + 5]
    flag  = df.iloc[-12:-1]
    curr  = float(df["Close"].iloc[-1])

    pole_gain = (float(pole["Close"].iloc[-1]) - float(pole["Close"].iloc[0])) / float(pole["Close"].iloc[0])
    if pole_gain < 0.015:
        return None

    flag_range = (float(flag["High"].max()) - float(flag["Low"].min())) / float(flag["Close"].mean())
    if flag_range > 0.025:
        return None

    flag_high = float(flag["High"].max())
    if curr > flag_high:
        return {
            "pattern":   "Bull Flag Breakout",
            "direction": "BUY",
            "details":   f"Pole gain {pole_gain*100:.1f}% → tight consolidation → breakout at ₹{curr:.2f}",
        }
    return None


def detect_head_and_shoulders(df, window: int = 40):
    if len(df) < window:
        return None
    closes = df["Close"].values[-window:].astype(float)

    peaks = [i for i in range(2, len(closes) - 2)
             if closes[i] > closes[i-1] and closes[i] > closes[i+1]
             and closes[i] > closes[i-2] and closes[i] > closes[i+2]]

    if len(peaks) < 3:
        return None

    for i in range(len(peaks) - 2):
        l_idx, h_idx, r_idx = peaks[i], peaks[i+1], peaks[i+2]
        left_sh, head, right_sh = closes[l_idx], closes[h_idx], closes[r_idx]
        if head <= left_sh or head <= right_sh:
            continue
        if abs(left_sh - right_sh) / head > 0.06:
            continue

        neckline = min(closes[l_idx:h_idx].min(), closes[h_idx:r_idx].min())
        current  = closes[-1]
        if current < neckline * 1.005:
            target = neckline - (head - neckline)
            return {
                "pattern":   "Head & Shoulders",
                "direction": "SELL",
                "details":   f"Neckline broken at ₹{neckline:.2f} — measured target ₹{target:.2f}",
            }
    return None


def detect_double_top(df, window: int = 30):
    if len(df) < window:
        return None
    highs  = df["High"].values[-window:].astype(float)
    closes = df["Close"].values[-window:].astype(float)

    half   = len(highs) // 2
    p1_idx = int(np.argmax(highs[:half]))
    p1_val = highs[p1_idx]

    search = highs[p1_idx + 3:]
    if len(search) == 0:
        return None
    p2_idx = int(np.argmax(search)) + p1_idx + 3
    p2_val = highs[p2_idx]

    if abs(p1_val - p2_val) / p1_val > 0.025:
        return None

    trough  = closes[p1_idx:p2_idx].min()
    current = closes[-1]

    if current < trough * 0.998:
        return {
            "pattern":   "Double Top",
            "direction": "SELL",
            "details":   f"Two peaks near ₹{p1_val:.2f} — neckline at ₹{trough:.2f} broken",
        }
    return None


def detect_double_bottom(df, window: int = 30):
    if len(df) < window:
        return None
    lows   = df["Low"].values[-window:].astype(float)
    closes = df["Close"].values[-window:].astype(float)

    half   = len(lows) // 2
    b1_idx = int(np.argmin(lows[:half]))
    b1_val = lows[b1_idx]

    search = lows[b1_idx + 3:]
    if len(search) == 0:
        return None
    b2_idx = int(np.argmin(search)) + b1_idx + 3
    b2_val = lows[b2_idx]

    if abs(b1_val - b2_val) / b1_val > 0.025:
        return None

    resistance = closes[b1_idx:b2_idx].max()
    current    = closes[-1]

    if current > resistance * 1.002:
        return {
            "pattern":   "Double Bottom",
            "direction": "BUY",
            "details":   f"Two troughs near ₹{b1_val:.2f} — neckline ₹{resistance:.2f} broken",
        }
    return None


def detect_ascending_triangle(df, window: int = 25):
    if len(df) < window:
        return None
    highs  = df["High"].values[-window:].astype(float)
    lows   = df["Low"].values[-window:].astype(float)
    closes = df["Close"].values[-window:].astype(float)

    resistance      = float(highs.max())
    resistance_hits = sum(1 for h in highs if abs(h - resistance) / resistance < 0.006)
    if resistance_hits < 2:
        return None

    x     = np.arange(len(lows))
    slope = float(np.polyfit(x, lows, 1)[0])
    if slope <= 0:
        return None

    if closes[-1] > resistance * 1.004:
        return {
            "pattern":   "Ascending Triangle",
            "direction": "BUY",
            "details":   f"Rising lows + flat resistance at ₹{resistance:.2f} — breakout confirmed",
        }
    return None


def detect_descending_triangle(df, window: int = 25):
    if len(df) < window:
        return None
    highs  = df["High"].values[-window:].astype(float)
    lows   = df["Low"].values[-window:].astype(float)
    closes = df["Close"].values[-window:].astype(float)

    support      = float(lows.min())
    support_hits = sum(1 for l in lows if abs(l - support) / support < 0.006)
    if support_hits < 2:
        return None

    x     = np.arange(len(highs))
    slope = float(np.polyfit(x, highs, 1)[0])
    if slope >= 0:
        return None

    if closes[-1] < support * 0.996:
        return {
            "pattern":   "Descending Triangle",
            "direction": "SELL",
            "details":   f"Falling highs + flat support at ₹{support:.2f} — breakdown confirmed",
        }
    return None


def detect_symmetrical_triangle(df, window: int = 25):
    if len(df) < window:
        return None
    highs  = df["High"].values[-window:].astype(float)
    lows   = df["Low"].values[-window:].astype(float)
    closes = df["Close"].values[-window:].astype(float)

    x          = np.arange(len(highs))
    high_slope = float(np.polyfit(x, highs, 1)[0])
    low_slope  = float(np.polyfit(x, lows,  1)[0])

    if not (high_slope < 0 and low_slope > 0):
        return None

    current = closes[-1]

    if current > highs[-1] * 1.003:
        return {
            "pattern":   "Symmetrical Triangle Breakout",
            "direction": "BUY",
            "details":   f"Converging trendlines — bullish breakout at ₹{current:.2f}",
        }
    if current < lows[-1] * 0.997:
        return {
            "pattern":   "Symmetrical Triangle Breakdown",
            "direction": "SELL",
            "details":   f"Converging trendlines — bearish breakdown at ₹{current:.2f}",
        }
    return None


# ══════════════════════════════════════════════════════════════
#  SUPPORT / RESISTANCE BREAKOUTS
# ══════════════════════════════════════════════════════════════

def detect_sr_breakout(df, window: int = 20):
    if len(df) < window + 5:
        return None

    hist    = df.iloc[-(window + 5):-5]
    recent  = df.iloc[-3:]
    current = float(df["Close"].iloc[-1])

    resistance  = float(hist["High"].max())
    support     = float(hist["Low"].min())
    avg_volume  = float(hist["Volume"].mean())
    curr_volume = float(recent["Volume"].mean())

    if avg_volume == 0:
        return None

    volume_ratio = curr_volume / avg_volume
    vol_surge    = volume_ratio > 1.4

    if current > resistance * 1.003 and vol_surge:
        return {
            "pattern":   "Resistance Breakout",
            "direction": "BUY",
            "details":   f"Broke ₹{resistance:.2f} resistance with {volume_ratio:.1f}× avg volume",
        }
    if current < support * 0.997 and vol_surge:
        return {
            "pattern":   "Support Breakdown",
            "direction": "SELL",
            "details":   f"Broke ₹{support:.2f} support with {volume_ratio:.1f}× avg volume",
        }
    return None


# ══════════════════════════════════════════════════════════════
#  SCAN ENGINE
# ══════════════════════════════════════════════════════════════

CANDLESTICK_DETECTORS = [
    detect_doji, detect_hammer, detect_inverted_hammer,
    detect_shooting_star, detect_bullish_engulfing,
    detect_bearish_engulfing, detect_morning_star, detect_evening_star,
]

CHART_DETECTORS = [
    detect_bull_flag, detect_head_and_shoulders,
    detect_double_top, detect_double_bottom,
    detect_ascending_triangle, detect_descending_triangle,
    detect_symmetrical_triangle,
]

SR_DETECTORS = [detect_sr_breakout]

ALL_DETECTORS = CANDLESTICK_DETECTORS + CHART_DETECTORS + SR_DETECTORS


# ══════════════════════════════════════════════════════════════
#  FINAL SIGNAL ENGINE
# ══════════════════════════════════════════════════════════════

# Weight table: higher = more reliable signal.
# Hierarchy: S/R Breakout (volume-confirmed) > Chart Pattern > Candlestick
PATTERN_WEIGHTS = {
    # ── S/R Breakouts ── strongest: price + volume confirmed
    "Resistance Breakout":            5,
    "Support Breakdown":              5,
    # ── Chart Patterns ── structural, multi-candle
    "Head & Shoulders":               4,
    "Double Top":                     4,
    "Double Bottom":                  4,
    "Bull Flag Breakout":             4,
    "Ascending Triangle":             3,
    "Descending Triangle":            3,
    "Symmetrical Triangle Breakout":  3,
    "Symmetrical Triangle Breakdown": 3,
    # ── Candlestick Patterns ── contextual, lower confidence alone
    "Morning Star":                   3,
    "Evening Star":                   3,
    "Bullish Engulfing":              2,
    "Bearish Engulfing":              2,
    "Hammer":                         2,
    "Shooting Star":                  2,
    "Inverted Hammer":                1,
    "Doji":                           1,   # always NEUTRAL
}

# Minimum score ratio advantage for a direction to "win".
# ratio = (buy_score - sell_score) / total_score  →  range -1.0 to +1.0
# > +0.25  → BUY   (buy at least 1.67× stronger than sell)
# < -0.25  → SELL  (sell at least 1.67× stronger than buy)
# otherwise → NEUTRAL (too conflicted to commit)
SIGNAL_THRESHOLD = 0.25


def resolve_final_signal(raw_patterns: list) -> dict | None:
    """
    Score all detected patterns for a single stock and resolve them into
    ONE final signal: BUY / SELL / NEUTRAL.

    Returns a dict with:
      final_direction  – "BUY" | "SELL" | "NEUTRAL"
      confidence       – 0-100 int (50 = equal conflict, 100 = perfect agreement)
      primary_pattern  – name of the highest-weight winning pattern
      primary_category – its category string
      details          – human-readable summary
      buy_score        – total BUY weight accumulated
      sell_score       – total SELL weight accumulated
      all_patterns     – original raw list (kept for frontend tooltip / debug)
    """
    if not raw_patterns:
        return None

    buy_score  = 0
    sell_score = 0
    buy_hits   = []   # (weight, pattern_dict)
    sell_hits  = []
    neutral_hits = []

    for p in raw_patterns:
        w   = PATTERN_WEIGHTS.get(p["pattern"], 1)
        dir_ = p["direction"]
        if dir_ == "BUY":
            buy_score += w
            buy_hits.append((w, p))
        elif dir_ == "SELL":
            sell_score += w
            sell_hits.append((w, p))
        else:
            neutral_hits.append((w, p))

    total = buy_score + sell_score

    # ── Resolve direction ──────────────────────────────────────
    if total == 0:
        # Only neutral / doji patterns found
        final_direction = "NEUTRAL"
        confidence      = 50
        winning_hits    = neutral_hits or []
    else:
        ratio = (buy_score - sell_score) / total   # -1.0 … +1.0

        if ratio > SIGNAL_THRESHOLD:
            final_direction = "BUY"
            confidence      = int(50 + ratio * 50)   # 62 … 100
            winning_hits    = buy_hits
        elif ratio < -SIGNAL_THRESHOLD:
            final_direction = "SELL"
            confidence      = int(50 + abs(ratio) * 50)
            winning_hits    = sell_hits
        else:
            # Signals conflict and neither dominates — stay flat
            final_direction = "NEUTRAL"
            confidence      = int(50 - abs(ratio) * 50)   # lower = more conflicted
            winning_hits    = neutral_hits or buy_hits or sell_hits

    # ── Pick primary (highest-weight) pattern from winner camp ──
    if winning_hits:
        primary_w, primary_p = max(winning_hits, key=lambda x: x[0])
    else:
        primary_p = raw_patterns[0]

    # ── Build human-readable details ───────────────────────────
    conflict_note = ""
    if buy_score > 0 and sell_score > 0:
        conflict_note = (
            f" | Signal resolved from {len(raw_patterns)} pattern(s): "
            f"BUY score {buy_score} vs SELL score {sell_score}"
        )

    details = primary_p["details"] + conflict_note

    return {
        "final_direction":  final_direction,
        "confidence":       confidence,
        "primary_pattern":  primary_p["pattern"],
        "primary_category": primary_p["category"],
        "details":          details,
        "buy_score":        buy_score,
        "sell_score":       sell_score,
        "all_patterns":     raw_patterns,   # full list for tooltip/debug
    }


# ══════════════════════════════════════════════════════════════
#  PER-TICKER SCAN  (now returns ONE alert per stock)
# ══════════════════════════════════════════════════════════════

def scan_ticker(ticker: str, name: str = "") -> list:
    """
    Run all pattern detectors on a single ticker, then resolve into
    exactly ONE final-signal alert.  Returns a list of 0 or 1 items.
    """
    df = fetch_ohlcv(ticker, period="5d", interval="15m")
    if df is None or len(df) < 25:
        print(f"[Scanner] {ticker}: insufficient data")
        return []

    # Drop the last candle — it is still forming during market hours
    # Running patterns on a live incomplete candle gives unstable results
    now_ist = datetime.now(IST).time()
    if MARKET_OPEN <= now_ist <= MARKET_CLOSE:
        df = df.iloc[:-1]

    if len(df) < 25:
        print(f"[Scanner] {ticker}: insufficient data after dropping live candle")
        return []

    raw_patterns = []
    close_value = _to_float(df["Close"].iloc[-1])
    if close_value is None:
        print(f"[Scanner] {ticker}: could not parse latest close")
        return []
    price   = round(close_value, 2)
    now_str = datetime.now(IST).strftime("%d %b %Y %H:%M IST")

    # ── Collect every pattern that fires ──────────────────────
    for detector in ALL_DETECTORS:
        try:
            result = detector(df)
            if result:
                if detector in CANDLESTICK_DETECTORS:
                    category = "Candlestick"
                elif detector in CHART_DETECTORS:
                    category = "Chart Pattern"
                else:
                    category = "S/R Breakout"

                raw_patterns.append({
                    "ticker":   ticker,
                    "name":     name or ticker,
                    "price":    price,
                    "category": category,
                    **result,
                })
        except Exception as e:
            print(f"[Scanner] {detector.__name__} on {ticker}: {e}")

    if not raw_patterns:
        return []

    # ── Run Final Signal Engine ────────────────────────────────
    signal = resolve_final_signal(raw_patterns)
    if signal is None:
        return []

    print(
        f"[Scanner] {ticker} → {signal['final_direction']} "
        f"(confidence {signal['confidence']}%, "
        f"buy_score={signal['buy_score']}, sell_score={signal['sell_score']}, "
        f"patterns_detected={len(raw_patterns)})"
    )

    return [{
        "id":              f"{ticker}_final_{int(time.time())}",
        "ticker":          ticker,
        "name":            name or ticker,
        "price":           price,
        "timestamp":       datetime.now().isoformat(),
        "time_str":        now_str,
        # ── resolved signal fields ──
        "pattern":         signal["primary_pattern"],
        "category":        signal["primary_category"],
        "direction":       signal["final_direction"],
        "details":         signal["details"],
        "confidence":      signal["confidence"],
        "buy_score":       signal["buy_score"],
        "sell_score":      signal["sell_score"],
        # ── raw breakdown for frontend tooltip / audit ──
        "all_patterns":    signal["all_patterns"],
    }]


def _build_portfolio_data() -> dict | None:
    try:
        from database import get_cash_balance, get_open_trades
        cash        = get_cash_balance()
        open_trades = get_open_trades()
        holdings    = []
        total_value = cash

        for trade in open_trades:
            t      = trade["ticker"]
            df_live = fetch_ohlcv(t, period="1d", interval="5m")
            if df_live is not None and not df_live.empty:
                ltp = _to_float(df_live["Close"].iloc[-1], trade["buy_price"])
            else:
                ltp = trade["buy_price"]
            cost   = trade["buy_price"] * trade["qty"]
            upnl   = (
                (ltp - trade["buy_price"]) * trade["qty"]
                if trade["direction"] == "BUY"
                else (trade["buy_price"] - ltp) * trade["qty"]
            )
            total_value += cost + upnl
            holdings.append({
                "ticker":         t,
                "direction":      trade["direction"],
                "qty":            trade["qty"],
                "buy_price":      trade["buy_price"],
                "current_price":  round(ltp, 2),
                "unrealised_pnl": round(upnl, 2),
                "return_pct":     round((upnl / cost) * 100, 2) if cost else 0,
            })

        starting_capital = 1_000_000
        pnl = total_value - starting_capital
        return {
            "cash_balance":    round(cash, 2),
            "total_value":     round(total_value, 2),
            "overall_pnl":     round(pnl, 2),
            "overall_pnl_pct": round((pnl / starting_capital) * 100, 2),
            "holdings":        holdings,
        }
    except Exception as e:
        print(f"[Scanner] Portfolio build error (non-critical): {e}")
        return None


def _is_duplicate_alert(ticker: str, direction: str, pattern: str) -> bool:
    try:
        for a in _read_alerts_file()[:20]:
            if (a.get("ticker") == ticker and
                a.get("direction") == direction and
                a.get("pattern") == pattern):
                age = (datetime.now() - datetime.fromisoformat(a["timestamp"])).total_seconds()
                if age < 1800:
                    return True
    except Exception:
        pass
    return False


# ══════════════════════════════════════════════════════════════
#  WATCHLIST SCAN + PERSIST
# ══════════════════════════════════════════════════════════════

def scan_watchlist() -> list:
    """Scan all stocks in watchlist and fire notifications."""
    watchlist  = load_watchlist()
    all_alerts = []

    portfolio_data = _build_portfolio_data()   # ← ADD: build once for all stocks

    for stock in watchlist:
        ticker = stock["ticker"]
        name   = stock.get("name", ticker)
        print(f"[Scanner] Scanning {ticker} ({name})...")
        alerts = scan_ticker(ticker, name)
        all_alerts.extend(alerts)

        if alerts:
            try:
                from notifier import send_alert
                for alert in alerts:
                    if _is_duplicate_alert(alert["ticker"], alert["direction"], alert["pattern"]):
                        print(f"[Scanner] {alert['ticker']}: duplicate suppressed")
                        continue

                    send_alert(
                        ticker       = alert["ticker"],
                        name         = alert["name"],
                        pattern_name = alert["pattern"],
                        direction    = alert["direction"],
                        details      = alert["details"],
                        price        = alert["price"],
                        category     = alert["category"],
                        confidence   = alert.get("confidence"),
                        buy_score    = alert.get("buy_score"),
                        sell_score   = alert.get("sell_score"),
                        portfolio    = portfolio_data,          # ← AI insight
                    )
            except Exception as e:
                print(f"[Notifier] {e}")

    _persist_alerts(all_alerts)
    return all_alerts


def _persist_alerts(new_alerts: list):
    with _alerts_lock:
        existing = _read_alerts_file()
        # Remove old entries for tickers being updated — keep only latest per ticker
        new_tickers = {a["ticker"] for a in new_alerts}
        filtered_existing = [a for a in existing if a["ticker"] not in new_tickers]
        combined = (new_alerts + filtered_existing)[:300]
        try:
            with open(ALERTS_FILE, "w") as f:
                json.dump(combined, f, indent=2)
        except Exception as e:
            print(f"[Scanner] Alert persist error: {e}")


def _read_alerts_file() -> list:
    if os.path.exists(ALERTS_FILE):
        try:
            with open(ALERTS_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return []


def get_recent_alerts(limit: int = 100) -> list:
    with _alerts_lock:
        return _read_alerts_file()[:limit]


def clear_alerts():
    with _alerts_lock:
        try:
            with open(ALERTS_FILE, "w") as f:
                json.dump([], f)
        except Exception:
            pass


# ══════════════════════════════════════════════════════════════
#  BACKGROUND SCANNER LOOP
# ══════════════════════════════════════════════════════════════

def scanner_loop(interval_minutes: int = 15):
    """
    Runs every `interval_minutes` minutes.
    Only scans during NSE market hours (9:15 AM – 3:30 PM IST).
    """
    print("[Scanner] Background scanner thread started.")
    time.sleep(30)
    while True:
        try:
            now_ist   = datetime.now(IST).time()
            is_market = MARKET_OPEN <= now_ist <= MARKET_CLOSE

            if is_market:
                print(f"[Scanner] Scan triggered at {datetime.now(IST).strftime('%H:%M:%S')} IST")
                alerts = scan_watchlist()
                print(f"[Scanner] Scan complete — {len(alerts)} final signal(s) emitted.")
            else:
                print(f"[Scanner] Market closed. Sleeping {interval_minutes} min.")

        except Exception as e:
            print(f"[Scanner] Loop error: {e}")

        time.sleep(interval_minutes * 60)