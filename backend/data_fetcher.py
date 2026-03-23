import requests
import yfinance as yf
import pandas as pd
import json
import os
import time
from datetime import datetime
from io import StringIO
from database import init_db, save_live_price, get_all_live_prices

NSE_EQUITY_CSV   = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
LOCAL_STOCK_CACHE = os.path.join(os.path.dirname(__file__), "nse_stocks_cache.json")

_ALL_STOCKS = {}


def load_nse_stocks():
    global _ALL_STOCKS
    if _ALL_STOCKS:
        return _ALL_STOCKS

    # ── Step 1: Try local cache first (fastest) ───────────────────────────────
    if os.path.exists(LOCAL_STOCK_CACHE):
        print("Loading NSE stocks from local cache...", end=" ", flush=True)
        try:
            with open(LOCAL_STOCK_CACHE, "r") as f:
                _ALL_STOCKS = json.load(f)
            print(f"{len(_ALL_STOCKS)} stocks loaded ✓")
            return _ALL_STOCKS
        except Exception as e:
            print(f"cache read failed: {e}")

    # ── Step 2: Try downloading from NSE ─────────────────────────────────────
    print("Downloading NSE equity list from NSE...", end=" ", flush=True)
    try:
        session = requests.Session()
        session.headers.update({
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                               "AppleWebKit/537.36 (KHTML, like Gecko) "
                               "Chrome/120.0.0.0 Safari/537.36",
            "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer":         "https://www.nseindia.com/",
        })
        # Warm up session — NSE sets cookies here
        session.get("https://www.nseindia.com", timeout=10)

        res = session.get(NSE_EQUITY_CSV, timeout=20)
        res.raise_for_status()

        df = pd.read_csv(StringIO(res.text))
        if "SERIES" in df.columns:
            df = df[df["SERIES"].str.strip() == "EQ"]

        stocks = {}
        for _, row in df.iterrows():
            try:
                ticker = str(row["SYMBOL"]).strip()
                name   = str(row["NAME OF COMPANY"]).strip()
                if ticker and name and ticker != "nan":
                    stocks[ticker] = {
                        "name":      name,
                        "sector":    "NSE",
                        "yf_symbol": f"{ticker}.NS",
                    }
            except Exception:
                continue

        _ALL_STOCKS = stocks

        # Save to local cache so next run is instant
        with open(LOCAL_STOCK_CACHE, "w") as f:
            json.dump(_ALL_STOCKS, f)
        print(f"{len(_ALL_STOCKS)} stocks loaded and cached ✓")
        return _ALL_STOCKS

    except Exception as e:
        print(f"\n  NSE download failed: {e}")

    # ── Step 3: Try alternate direct URL ─────────────────────────────────────
    print("Trying alternate NSE URL...", end=" ", flush=True)
    try:
        res = requests.get(
            "https://archives.nseindia.com/content/equities/EQUITY_L.csv",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=20
        )
        res.raise_for_status()

        df = pd.read_csv(StringIO(res.text))
        if "SERIES" in df.columns:
            df = df[df["SERIES"].str.strip() == "EQ"]

        stocks = {}
        for _, row in df.iterrows():
            try:
                ticker = str(row["SYMBOL"]).strip()
                name   = str(row["NAME OF COMPANY"]).strip()
                if ticker and name and ticker != "nan":
                    stocks[ticker] = {
                        "name":      name,
                        "sector":    "NSE",
                        "yf_symbol": f"{ticker}.NS",
                    }
            except Exception:
                continue

        _ALL_STOCKS = stocks
        with open(LOCAL_STOCK_CACHE, "w") as f:
            json.dump(_ALL_STOCKS, f)
        print(f"{len(_ALL_STOCKS)} stocks loaded ✓")
        return _ALL_STOCKS

    except Exception as e:
        print(f"failed: {e}")

    # ── Step 4: Build from yfinance Nifty indices ─────────────────────────────
    print("Building stock list from Nifty indices via yfinance...", end=" ", flush=True)
    try:
        stocks = {}
        # Nifty 500 components can be fetched this way
        indices = ["^CNX500", "^NSEI", "^NSMIDCP"]
        for idx in indices:
            try:
                t = yf.Ticker(idx)
                components = t.components
                if components is not None and not components.empty:
                    for ticker in components.index:
                        clean = ticker.replace(".NS", "")
                        stocks[clean] = {
                            "name":      clean,
                            "sector":    "NSE",
                            "yf_symbol": ticker if ".NS" in ticker else f"{ticker}.NS",
                        }
            except Exception:
                continue

        if stocks:
            _ALL_STOCKS = stocks
            with open(LOCAL_STOCK_CACHE, "w") as f:
                json.dump(_ALL_STOCKS, f)
            print(f"{len(_ALL_STOCKS)} stocks loaded ✓")
            return _ALL_STOCKS
    except Exception as e:
        print(f"failed: {e}")

    # ── Step 5: Last resort — use hardcoded 200 stock list ───────────────────
    print("Using hardcoded fallback list (200 stocks).")
    _ALL_STOCKS = get_fallback_stocks()
    # Still cache it so future runs are fast
    with open(LOCAL_STOCK_CACHE, "w") as f:
        json.dump(_ALL_STOCKS, f)
    return _ALL_STOCKS


def get_fallback_stocks():
    stocks = {
        "RELIANCE": "Reliance Industries", "TCS": "Tata Consultancy Services",
        "HDFCBANK": "HDFC Bank", "INFY": "Infosys", "ICICIBANK": "ICICI Bank",
        "HINDUNILVR": "Hindustan Unilever", "SBIN": "State Bank of India",
        "BAJFINANCE": "Bajaj Finance", "KOTAKBANK": "Kotak Mahindra Bank",
        "BHARTIARTL": "Bharti Airtel", "ITC": "ITC Limited",
        "AXISBANK": "Axis Bank", "LT": "Larsen & Toubro",
        "ASIANPAINT": "Asian Paints", "MARUTI": "Maruti Suzuki",
        "SUNPHARMA": "Sun Pharmaceutical", "TITAN": "Titan Company",
        "ULTRACEMCO": "UltraTech Cement", "HCLTECH": "HCL Technologies",
        "WIPRO": "Wipro", "NESTLEIND": "Nestle India", "TECHM": "Tech Mahindra",
        "NTPC": "NTPC Limited", "POWERGRID": "Power Grid Corp",
        "TATAMOTORS": "Tata Motors", "TATASTEEL": "Tata Steel",
        "ADANIPORTS": "Adani Ports", "JSWSTEEL": "JSW Steel",
        "ONGC": "ONGC", "COALINDIA": "Coal India", "GRASIM": "Grasim Industries",
        "BPCL": "BPCL", "DRREDDY": "Dr. Reddy's Labs", "CIPLA": "Cipla",
        "EICHERMOT": "Eicher Motors", "DIVISLAB": "Divi's Laboratories",
        "HEROMOTOCO": "Hero MotoCorp", "SBILIFE": "SBI Life Insurance",
        "HDFCLIFE": "HDFC Life Insurance", "BRITANNIA": "Britannia Industries",
        "APOLLOHOSP": "Apollo Hospitals", "BAJAJFINSV": "Bajaj Finserv",
        "ADANIENT": "Adani Enterprises", "INDUSINDBK": "IndusInd Bank",
        "TATACONSUM": "Tata Consumer Products", "SHREECEM": "Shree Cement",
        "UPL": "UPL Limited", "ZOMATO": "Zomato", "HINDALCO": "Hindalco Industries",
        "DMART": "DMart", "PIDILITIND": "Pidilite Industries",
        "SIEMENS": "Siemens India", "HAVELLS": "Havells India",
        "BERGEPAINT": "Berger Paints", "COLPAL": "Colgate-Palmolive India",
        "MARICO": "Marico", "GODREJCP": "Godrej Consumer Products",
        "LUPIN": "Lupin", "TORNTPHARM": "Torrent Pharmaceuticals",
        "GAIL": "GAIL India", "IOC": "Indian Oil Corporation",
        "AMBUJACEM": "Ambuja Cements", "ACC": "ACC Limited",
        "CHOLAFIN": "Cholamandalam Investment", "MUTHOOTFIN": "Muthoot Finance",
        "PAGEIND": "Page Industries", "TATAPOWER": "Tata Power",
        "BANKBARODA": "Bank of Baroda", "PNB": "Punjab National Bank",
        "CANBK": "Canara Bank", "FEDERALBNK": "Federal Bank",
        "IDFCFIRSTB": "IDFC First Bank", "BANDHANBNK": "Bandhan Bank",
        "YESBANK": "Yes Bank", "IRCTC": "IRCTC", "HAL": "Hindustan Aeronautics",
        "BEL": "Bharat Electronics", "BHEL": "BHEL", "SAIL": "SAIL",
        "NMDC": "NMDC", "RECLTD": "REC Limited", "PFC": "Power Finance Corp",
        "IRFC": "Indian Railway Finance Corp", "SUZLON": "Suzlon Energy",
        "JINDALSTEL": "Jindal Steel & Power", "VEDL": "Vedanta",
        "NAUKRI": "Info Edge (Naukri)", "PAYTM": "Paytm",
        "NYKAA": "Nykaa", "DELHIVERY": "Delhivery",
        "BAJAJ-AUTO": "Bajaj Auto", "MM": "Mahindra & Mahindra",
    }
    return {
        t: {"name": n, "sector": "NSE", "yf_symbol": f"{t}.NS"}
        for t, n in stocks.items()
    }


def download_nse_stock_list_manually():
    """
    Call this ONCE manually if auto-download keeps failing.
    Run: python data_fetcher.py --download
    """
    print("\n=== Manual NSE Stock List Download ===")
    print("Opening NSE website in your browser...")
    print(f"Download this file manually: {NSE_EQUITY_CSV}")
    print("Save it as 'EQUITY_L.csv' in your backend folder.")
    print("Then run: python parse_equity_csv.py")


def build_cache_from_local_csv(csv_path="EQUITY_L.csv"):
    """
    If you manually downloaded EQUITY_L.csv, run this to build the cache.
    Usage: from data_fetcher import build_cache_from_local_csv
           build_cache_from_local_csv()
    """
    global _ALL_STOCKS
    print(f"Reading local CSV: {csv_path}")
    try:
        df = pd.read_csv(csv_path)
        if "SERIES" in df.columns:
            df = df[df["SERIES"].str.strip() == "EQ"]

        stocks = {}
        for _, row in df.iterrows():
            try:
                ticker = str(row["SYMBOL"]).strip()
                name   = str(row["NAME OF COMPANY"]).strip()
                if ticker and name and ticker != "nan":
                    stocks[ticker] = {
                        "name":      name,
                        "sector":    "NSE",
                        "yf_symbol": f"{ticker}.NS",
                    }
            except Exception:
                continue

        _ALL_STOCKS = stocks
        with open(LOCAL_STOCK_CACHE, "w") as f:
            json.dump(_ALL_STOCKS, f)
        print(f"Done! {len(_ALL_STOCKS)} stocks cached to nse_stocks_cache.json ✓")
        # Clean up CSV
        if os.path.exists(csv_path):
            os.remove(csv_path)
    except Exception as e:
        print(f"Error: {e}")


def fetch_price_for_ticker(ticker):
    """Fetch live price for a single ticker on demand."""
    try:
        stock = yf.Ticker(f"{ticker}.NS")
        price = stock.fast_info.last_price
        if price and price > 0:
            save_live_price(ticker, round(float(price), 2))
            return round(float(price), 2)
    except Exception:
        pass
    return None


def fetch_live_prices_batch(tickers):
    """Batch fetch live prices for a list of tickers."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching {len(tickers)} prices...")
    symbols = [f"{t}.NS" for t in tickers]
    try:
        data = yf.download(
            symbols, period="1d", interval="1m",
            auto_adjust=True, progress=False, group_by="ticker"
        )
        updated = 0
        for ticker in tickers:
            try:
                yf_sym = f"{ticker}.NS"
                df = data[yf_sym] if len(symbols) > 1 else data
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                if df is not None and not df.empty:
                    price = float(df["Close"].dropna().iloc[-1])
                    save_live_price(ticker, round(price, 2))
                    updated += 1
            except Exception:
                pass
        print(f"  Updated {updated}/{len(tickers)} prices.")
    except Exception as e:
        print(f"  Batch failed: {e}")


def fetch_live_prices():
    """
    Called every 60 seconds by background thread.
    Fetches ALL Nifty 500 prices in batches of 50.
    """
    from database import get_open_trades

    # Get current Nifty 500 list dynamically
    try:
        from app import fetch_nifty500_tickers
        nifty500 = fetch_nifty500_tickers()
    except Exception:
        nifty500 = []

    # Always include user's open positions
    try:
        open_trades  = get_open_trades()
        user_tickers = [t["ticker"] for t in open_trades]
    except Exception:
        user_tickers = []

    all_tickers = list(set(nifty500 + user_tickers))

    if not all_tickers:
        # Fallback to top 50 if Nifty 500 not loaded yet
        all_tickers = [
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
            "SBIN", "KOTAKBANK", "AXISBANK", "HINDUNILVR", "BAJFINANCE",
            "ITC", "LT", "WIPRO", "HCLTECH", "TECHM", "SUNPHARMA",
            "MARUTI", "TATAMOTORS", "TATASTEEL", "ADANIPORTS",
            "ZOMATO", "ETERNAL", "NTPC", "POWERGRID", "ONGC",
            "COALINDIA", "BHARTIARTL", "TITAN", "ASIANPAINT",
            "NESTLEIND", "ULTRACEMCO", "DRREDDY", "CIPLA", "DIVISLAB",
            "HEROMOTOCO", "HDFCLIFE", "SBILIFE", "APOLLOHOSP", "GRASIM",
            "JSWSTEEL", "HINDALCO", "VEDL", "HAL", "BEL", "IRCTC",
            "TATAPOWER", "DMART", "BAJAJFINSV", "INDUSINDBK", "MCX",
        ]

    # Split into chunks of 50 — yfinance handles 50 well
    chunk_size = 50
    chunks = [all_tickers[i:i + chunk_size] for i in range(0, len(all_tickers), chunk_size)]

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching {len(all_tickers)} prices in {len(chunks)} batches...")

    for chunk in chunks:
        fetch_live_prices_batch(chunk)
        time.sleep(1)

    print(f"  All {len(all_tickers)} prices updated.")


def data_exists():
    return len(get_all_live_prices()) > 0


if __name__ == "__main__":
    import sys
    init_db()

    if "--download" in sys.argv:
        download_nse_stock_list_manually()
    elif "--from-csv" in sys.argv:
        build_cache_from_local_csv()
    else:
        print("=== Paper Trade Arena — Setup ===\n")
        stocks = load_nse_stocks()
        print(f"Total stocks available: {len(stocks)}\n")
        fetch_live_prices()
        prices = get_all_live_prices()
        print(f"\n{len(prices)} live prices saved.")
        print("\nRun: python app.py")
