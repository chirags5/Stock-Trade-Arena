import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "arena.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS historical_prices (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker  TEXT NOT NULL,
            date    TEXT NOT NULL,
            open    REAL,
            high    REAL,
            low     REAL,
            close   REAL,
            volume  REAL,
            UNIQUE(ticker, date)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS live_prices (
            ticker     TEXT PRIMARY KEY,
            price      REAL NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS signals (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker      TEXT NOT NULL,
            stock_name  TEXT NOT NULL,
            pattern     TEXT NOT NULL,
            direction   TEXT NOT NULL,
            price       REAL NOT NULL,
            win_rate    REAL NOT NULL,
            conviction  INTEGER NOT NULL,
            explanation TEXT,
            outcome     TEXT DEFAULT NULL,
            created_at  TEXT NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id  INTEGER NOT NULL,
            ticker     TEXT NOT NULL,
            direction  TEXT NOT NULL,
            qty        INTEGER NOT NULL,
            buy_price  REAL NOT NULL,
            sell_price REAL DEFAULT NULL,
            pnl        REAL DEFAULT NULL,
            status     TEXT DEFAULT 'OPEN',
            buy_time   TEXT NOT NULL,
            sell_time  TEXT DEFAULT NULL,
            FOREIGN KEY (signal_id) REFERENCES signals(id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS portfolio (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      TEXT NOT NULL DEFAULT 'demo_user',
            cash_balance REAL NOT NULL DEFAULT 1000000.0,
            updated_at   TEXT NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS leaderboard_users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT NOT NULL UNIQUE,
            portfolio_val REAL NOT NULL,
            is_real       INTEGER DEFAULT 0
        )
    """)

    # seed demo user portfolio
    exists = c.execute(
        "SELECT id FROM portfolio WHERE user_id = 'demo_user'"
    ).fetchone()
    if not exists:
        c.execute(
            "INSERT INTO portfolio (user_id, cash_balance, updated_at) VALUES (?,?,?)",
            ("demo_user", 1000000.0, datetime.now().isoformat())
        )
        print("Demo user created — ₹10,00,000 virtual cash ready")

    # seed fake leaderboard users
    fake_users = [
        ("TradingPro_99",  1124500, 0),
        ("Mumbai_Bulls",   1087200, 0),
        ("NSE_Watcher",    1043800, 0),
        ("Dalal_St_Fan",    982400, 0),
        ("Beginner_01",     961000, 0),
        ("demo_user",      1000000, 1),
    ]
    for username, val, is_real in fake_users:
        c.execute("""
            INSERT OR IGNORE INTO leaderboard_users (username, portfolio_val, is_real)
            VALUES (?,?,?)
        """, (username, val, is_real))

    conn.commit()
    conn.close()
    print("All tables created successfully.")


# ── Portfolio helpers ─────────────────────────────────────────────────────────

def get_cash_balance():
    conn = get_connection()
    row = conn.execute(
        "SELECT cash_balance FROM portfolio WHERE user_id = 'demo_user'"
    ).fetchone()
    conn.close()
    return row["cash_balance"] if row else 1000000.0


def update_cash_balance(new_balance):
    conn = get_connection()
    conn.execute(
        "UPDATE portfolio SET cash_balance = ?, updated_at = ? WHERE user_id = 'demo_user'",
        (new_balance, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()


# ── Live price helpers ────────────────────────────────────────────────────────

def save_live_price(ticker, price):
    conn = get_connection()
    conn.execute("""
        INSERT INTO live_prices (ticker, price, updated_at) VALUES (?,?,?)
        ON CONFLICT(ticker) DO UPDATE SET price=?, updated_at=?
    """, (ticker, price, datetime.now().isoformat(),
          price, datetime.now().isoformat()))
    conn.commit()
    conn.close()


def get_live_price(ticker):
    conn = get_connection()
    row = conn.execute(
        "SELECT price FROM live_prices WHERE ticker=?", (ticker,)
    ).fetchone()
    conn.close()
    return row["price"] if row else None


def get_all_live_prices():
    conn = get_connection()
    rows = conn.execute("SELECT ticker, price FROM live_prices").fetchall()
    conn.close()
    return {r["ticker"]: r["price"] for r in rows}


# ── Historical price helpers ──────────────────────────────────────────────────

def save_historical_prices(ticker, df):
    conn = get_connection()
    saved = 0
    for date, row in df.iterrows():
        try:
            conn.execute("""
                INSERT OR IGNORE INTO historical_prices
                    (ticker, date, open, high, low, close, volume)
                VALUES (?,?,?,?,?,?,?)
            """, (
                ticker,
                str(date.date()),
                float(row["Open"]),
                float(row["High"]),
                float(row["Low"]),
                float(row["Close"]),
                float(row["Volume"])
            ))
            saved += 1
        except Exception:
            pass
    conn.commit()
    conn.close()
    return saved


def get_historical_prices(ticker, limit=500):
    conn = get_connection()
    rows = conn.execute("""
        SELECT date, open, high, low, close, volume
        FROM historical_prices
        WHERE ticker = ?
        ORDER BY date ASC
        LIMIT ?
    """, (ticker, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Signal helpers ────────────────────────────────────────────────────────────

def save_signal(ticker, stock_name, pattern, direction,
                price, win_rate, conviction, explanation):
    conn = get_connection()
    cursor = conn.execute("""
        INSERT INTO signals
            (ticker, stock_name, pattern, direction, price,
             win_rate, conviction, explanation, created_at)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, (ticker, stock_name, pattern, direction, price,
          win_rate, conviction, explanation, datetime.now().isoformat()))
    signal_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return signal_id


def get_all_signals():
    conn = get_connection()
    rows = conn.execute("""
        SELECT * FROM signals ORDER BY created_at DESC LIMIT 10
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_signal_outcome(signal_id, outcome):
    conn = get_connection()
    conn.execute(
        "UPDATE signals SET outcome=? WHERE id=?", (outcome, signal_id)
    )
    conn.commit()
    conn.close()


# ── Trade helpers ─────────────────────────────────────────────────────────────

def save_trade(signal_id, ticker, direction, qty, buy_price):
    conn = get_connection()
    cursor = conn.execute("""
        INSERT INTO trades
            (signal_id, ticker, direction, qty, buy_price, status, buy_time)
        VALUES (?,?,?,?,?,?,?)
    """, (signal_id, ticker, direction, qty, buy_price,
          "OPEN", datetime.now().isoformat()))
    trade_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return trade_id


def close_trade(trade_id, sell_price):
    conn = get_connection()
    trade = conn.execute(
        "SELECT * FROM trades WHERE id=?", (trade_id,)
    ).fetchone()
    if not trade:
        conn.close()
        return None

    if trade["direction"] == "BUY":
        pnl = (sell_price - trade["buy_price"]) * trade["qty"]
    else:
        pnl = (trade["buy_price"] - sell_price) * trade["qty"]

    conn.execute("""
        UPDATE trades
        SET sell_price=?, pnl=?, status='CLOSED', sell_time=?
        WHERE id=?
    """, (sell_price, pnl, datetime.now().isoformat(), trade_id))
    conn.commit()
    conn.close()
    return round(pnl, 2)


def get_open_trades():
    conn = get_connection()
    rows = conn.execute("""
        SELECT t.*, s.explanation, s.pattern, s.conviction
        FROM trades t
        JOIN signals s ON t.signal_id = s.id
        WHERE t.status = 'OPEN'
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_trades():
    conn = get_connection()
    rows = conn.execute("""
        SELECT t.*, s.explanation, s.pattern, s.conviction
        FROM trades t
        JOIN signals s ON t.signal_id = s.id
        ORDER BY t.buy_time DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Leaderboard helpers ───────────────────────────────────────────────────────

def get_leaderboard():
    conn = get_connection()
    rows = conn.execute("""
        SELECT username, portfolio_val, is_real
        FROM leaderboard_users
        ORDER BY portfolio_val DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_leaderboard_realuser(portfolio_val):
    conn = get_connection()
    conn.execute("""
        UPDATE leaderboard_users SET portfolio_val=? WHERE username='demo_user'
    """, (portfolio_val,))
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()