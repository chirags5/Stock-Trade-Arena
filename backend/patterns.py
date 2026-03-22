import statistics
from database import get_historical_prices, get_live_price
from data_fetcher import STOCKS, STOCK_NAMES


def detect_patterns_for_all_stocks():
    """
    Runs pattern detection on all 8 stocks.
    Returns a list of detected signals.
    Called by app.py when /signals route is hit.
    """
    all_signals = []

    for ticker in STOCKS.keys():
        signals = detect_patterns_for_stock(ticker)
        all_signals.extend(signals)

    return all_signals


def detect_patterns_for_stock(ticker):
    """
    Runs all 3 pattern checks on a single stock.
    Returns list of pattern dicts (could be empty if no pattern found).
    """
    rows = get_historical_prices(ticker, limit=60)

    if len(rows) < 25:
        print(f"  {ticker}: not enough data (need 25 days, have {len(rows)})")
        return []

    closes  = [r["close"]  for r in rows]
    highs   = [r["high"]   for r in rows]
    lows    = [r["low"]    for r in rows]
    volumes = [r["volume"] for r in rows]

    live_price = get_live_price(ticker)
    current_price = live_price if live_price else closes[-1]

    detected = []

    # Check all 3 patterns
    breakout = check_bullish_breakout(closes, volumes)
    if breakout:
        breakout["ticker"]     = ticker
        breakout["stock_name"] = STOCK_NAMES.get(ticker, ticker)
        breakout["price"]      = current_price
        detected.append(breakout)

    bounce = check_support_bounce(closes, lows, volumes)
    if bounce:
        bounce["ticker"]     = ticker
        bounce["stock_name"] = STOCK_NAMES.get(ticker, ticker)
        bounce["price"]      = current_price
        detected.append(bounce)

    breakdown = check_bearish_breakdown(closes, volumes)
    if breakdown:
        breakdown["ticker"]     = ticker
        breakdown["stock_name"] = STOCK_NAMES.get(ticker, ticker)
        breakdown["price"]      = current_price
        detected.append(breakdown)

    return detected


# ── Pattern 1: Bullish Breakout ───────────────────────────────────────────────
# Rule: Today's close > highest close in last 20 days
#       AND today's volume > 1.5x the 20-day average volume

def check_bullish_breakout(closes, volumes):
    if len(closes) < 22 or len(volumes) < 22:
        return None

    today_close     = closes[-1]
    today_volume    = volumes[-1]
    last_20_closes  = closes[-21:-1]   # 20 days before today
    last_20_volumes = volumes[-21:-1]

    highest_20d     = max(last_20_closes)
    avg_volume_20d  = statistics.mean(last_20_volumes)

    price_breakout  = today_close > highest_20d
    volume_confirm  = today_volume > (avg_volume_20d * 1.5)

    if price_breakout and volume_confirm:
        volume_ratio = round(today_volume / avg_volume_20d, 1)
        return {
            "pattern":   "Bullish Flag Breakout",
            "direction": "BUY",
            "details": {
                "today_close":    round(today_close, 2),
                "highest_20d":    round(highest_20d, 2),
                "volume_ratio":   volume_ratio,
                "avg_volume_20d": round(avg_volume_20d, 0),
            }
        }
    return None


# ── Pattern 2: Support Bounce ─────────────────────────────────────────────────
# Rule: Price dropped to its 20-day low zone (within 1%)
#       AND today closed higher than yesterday (bounce confirmed)
#       AND volume > 1.2x average (buyers stepping in)

def check_support_bounce(closes, lows, volumes):
    if len(closes) < 22 or len(lows) < 22:
        return None

    today_close      = closes[-1]
    yesterday_close  = closes[-2]
    today_low        = lows[-1]
    last_20_lows     = lows[-21:-1]
    last_20_volumes  = volumes[-21:-1]

    support_level    = min(last_20_lows)
    avg_volume       = statistics.mean(last_20_volumes)
    today_volume     = volumes[-1]

    # Price touched near support (within 1%) and bounced up
    near_support  = today_low <= support_level * 1.01
    bounced_up    = today_close > yesterday_close
    volume_ok     = today_volume > avg_volume * 1.2

    if near_support and bounced_up and volume_ok:
        return {
            "pattern":   "Support Bounce",
            "direction": "BUY",
            "details": {
                "today_close":   round(today_close, 2),
                "support_level": round(support_level, 2),
                "today_low":     round(today_low, 2),
                "volume_ratio":  round(today_volume / avg_volume, 1),
            }
        }
    return None


# ── Pattern 3: Bearish Breakdown ──────────────────────────────────────────────
# Rule: Today's close < lowest close in last 20 days
#       AND today's volume > 1.5x average volume

def check_bearish_breakdown(closes, volumes):
    if len(closes) < 22 or len(volumes) < 22:
        return None

    today_close     = closes[-1]
    today_volume    = volumes[-1]
    last_20_closes  = closes[-21:-1]
    last_20_volumes = volumes[-21:-1]

    lowest_20d     = min(last_20_closes)
    avg_volume_20d = statistics.mean(last_20_volumes)

    price_breakdown = today_close < lowest_20d
    volume_confirm  = today_volume > avg_volume_20d * 1.5

    if price_breakdown and volume_confirm:
        volume_ratio = round(today_volume / avg_volume_20d, 1)
        return {
            "pattern":   "Bearish Breakdown",
            "direction": "SHORT",
            "details": {
                "today_close":  round(today_close, 2),
                "lowest_20d":   round(lowest_20d, 2),
                "volume_ratio": volume_ratio,
            }
        }
    return None


# ── Test: run this file directly to see what patterns are detected today ──────
if __name__ == "__main__":
    from database import init_db
    init_db()

    print("\n=== Running Pattern Detection on All 8 Stocks ===\n")
    signals = detect_patterns_for_all_stocks()

    if not signals:
        print("No patterns detected today across all stocks.")
        print("This is normal — patterns don't appear every day.")
        print("The back-test engine will still calculate historical win rates.")
    else:
        print(f"Found {len(signals)} pattern(s):\n")
        for s in signals:
            print(f"  {s['ticker']} — {s['pattern']} ({s['direction']})")
            print(f"  Price: ₹{s['price']}")
            for k, v in s['details'].items():
                print(f"    {k}: {v}")
            print()

    print("\nRun next: python backtest.py")


