import yfinance as yf
import pandas as pd
from datetime import datetime
from database import (
    init_db, save_live_price, save_historical_prices,
    get_historical_prices, get_all_live_prices
)

STOCKS = {
    "RELIANCE":   "RELIANCE.NS",
    "TCS":        "TCS.NS",
    "HDFCBANK":   "HDFCBANK.NS",
    "INFY":       "INFY.NS",
    "WIPRO":      "WIPRO.NS",
    "BAJFINANCE": "BAJFINANCE.NS",
    "SUNPHARMA": "SUNPHARMA.NS",
    "ADANIPORTS": "ADANIPORTS.NS",
}

STOCK_NAMES = {
    "RELIANCE":   "Reliance Industries",
    "TCS":        "Tata Consultancy Services",
    "HDFCBANK":   "HDFC Bank",
    "INFY":       "Infosys",
    "WIPRO":      "Wipro",
    "BAJFINANCE": "Bajaj Finance",
    "SUNPHARMA": "Sun Pharmaceutical",
    "ADANIPORTS": "Adani Ports",
}


def download_historical_data():
    print("\n=== Downloading 2 years of historical data ===")
    for ticker, yf_symbol in STOCKS.items():
        print(f"  {ticker}...", end=" ")
        try:
            df = yf.download(
                yf_symbol,
                period="2y",
                interval="1d",
                auto_adjust=True,
                progress=False
            )
            if df.empty:
                print("no data returned")
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            rows = save_historical_prices(ticker, df)
            print(f"saved {rows} rows")
        except Exception as e:
            print(f"ERROR — {e}")
    print("Historical download done.\n")


def fetch_live_prices():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching live prices...")
    for ticker, yf_symbol in STOCKS.items():
        try:
            stock = yf.Ticker(yf_symbol)
            price = stock.fast_info.last_price

            if price and price > 0:
                save_live_price(ticker, round(float(price), 2))
                print(f"  {ticker}: ₹{price:.2f}")
            else:
                # fallback — get last closing price
                df = yf.download(
                    yf_symbol,
                    period="5d",
                    interval="1d",
                    auto_adjust=True,
                    progress=False
                )
                if not df.empty:
                    if isinstance(df.columns, pd.MultiIndex):
                        df.columns = df.columns.get_level_values(0)
                    price = float(df["Close"].iloc[-1])
                    save_live_price(ticker, round(price, 2))
                    print(f"  {ticker}: ₹{price:.2f} (last close)")
                else:
                    print(f"  {ticker}: no price available")

        except Exception as e:
            print(f"  {ticker}: ERROR — {e}")


def data_exists():
    rows = get_historical_prices("RELIANCE", limit=5)
    return len(rows) > 0


def get_closes(ticker, days=60):
    rows = get_historical_prices(ticker, limit=days)
    return [r["close"] for r in rows]


def get_volumes(ticker, days=60):
    rows = get_historical_prices(ticker, limit=days)
    return [r["volume"] for r in rows]


if __name__ == "__main__":
    print("=== Paper Trade Arena — First Time Setup ===\n")
    init_db()

    if data_exists():
        print("Historical data already in database. Skipping download.")
    else:
        download_historical_data()

    fetch_live_prices()

    print("\n=== Setup Complete ===")
    prices = get_all_live_prices()
    print("\nCurrent prices saved in database:")
    for ticker, price in prices.items():
        print(f"  {ticker}: ₹{price}")
    print("\nNext step: python app.py")
