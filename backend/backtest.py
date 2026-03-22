from database import get_historical_prices


def calculate_win_rate(ticker, pattern_fn, lookahead_days=5):
    """
    Loops through 2 years of historical data.
    Every time the pattern appeared in the past,
    checks if the price went up after lookahead_days.
    Returns win_rate % and how many times pattern appeared.
    """
    rows = get_historical_prices(ticker, limit=500)

    if len(rows) < 30:
        return 50.0, 0

    closes  = [r["close"]  for r in rows]
    highs   = [r["high"]   for r in rows]
    lows    = [r["low"]    for r in rows]
    volumes = [r["volume"] for r in rows]

    hits  = 0
    total = 0

    # Start at day 25 so patterns have enough lookback data
    # Stop 5 days before the end so we can check outcome
    for i in range(25, len(closes) - lookahead_days):
        c_slice = closes[:i+1]
        v_slice = volumes[:i+1]
        l_slice = lows[:i+1]

        pattern_found = pattern_fn(c_slice, v_slice, l_slice)

        if pattern_found:
            total += 1
            # Did price go up after lookahead_days?
            price_now   = closes[i]
            price_later = closes[i + lookahead_days]

            if price_later > price_now:
                hits += 1

    if total == 0:
        return 50.0, 0

    win_rate = round((hits / total) * 100, 1)
    return win_rate, total


# ── Pattern functions shaped for backtest ────────────────────────────────────
# These mirror patterns.py logic but take slices as arguments

def bullish_breakout_fn(closes, volumes, lows):
    if len(closes) < 22 or len(volumes) < 22:
        return False
    import statistics
    today_close     = closes[-1]
    today_volume    = volumes[-1]
    last_20_closes  = closes[-21:-1]
    last_20_volumes = volumes[-21:-1]
    highest_20d     = max(last_20_closes)
    avg_vol         = statistics.mean(last_20_volumes)
    return today_close > highest_20d and today_volume > avg_vol * 1.5


def support_bounce_fn(closes, volumes, lows):
    if len(closes) < 22 or len(lows) < 22:
        return False
    import statistics
    today_close     = closes[-1]
    yesterday_close = closes[-2]
    today_low       = lows[-1]
    last_20_lows    = lows[-21:-1]
    last_20_volumes = volumes[-21:-1]
    support_level   = min(last_20_lows)
    avg_vol         = statistics.mean(last_20_volumes)
    today_volume    = volumes[-1]
    near_support    = today_low <= support_level * 1.01
    bounced_up      = today_close > yesterday_close
    volume_ok       = today_volume > avg_vol * 1.2
    return near_support and bounced_up and volume_ok


def bearish_breakdown_fn(closes, volumes, lows):
    if len(closes) < 22 or len(volumes) < 22:
        return False
    import statistics
    today_close     = closes[-1]
    today_volume    = volumes[-1]
    last_20_closes  = closes[-21:-1]
    last_20_volumes = volumes[-21:-1]
    lowest_20d      = min(last_20_closes)
    avg_vol         = statistics.mean(last_20_volumes)
    return today_close < lowest_20d and today_volume > avg_vol * 1.5


PATTERN_FNS = {
    "Bullish Flag Breakout": bullish_breakout_fn,
    "Support Bounce":        support_bounce_fn,
    "Bearish Breakdown":     bearish_breakdown_fn,
}


def get_win_rate(ticker, pattern_name):
    """
    Main function called by ai_layer.py and app.py.
    Returns (win_rate, occurrences) for a given stock + pattern.
    """
    fn = PATTERN_FNS.get(pattern_name)
    if not fn:
        return 50.0, 0
    return calculate_win_rate(ticker, fn)


if __name__ == "__main__":
    from database import init_db
    init_db()

    tickers  = ["RELIANCE", "TCS", "HDFCBANK", "INFY"]
    patterns = ["Bullish Flag Breakout", "Support Bounce", "Bearish Breakdown"]

    print("\n=== Back-test Results ===\n")
    for ticker in tickers:
        print(f"{ticker}:")
        for pattern in patterns:
            win_rate, count = get_win_rate(ticker, pattern)
            print(f"  {pattern}: {win_rate}% win rate ({count} occurrences)")
        print()

    print("Run next: python ai_layer.py")