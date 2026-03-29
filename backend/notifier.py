"""
notifier.py — Sends pattern alerts via Telegram and Email (Gmail).
Config is read from notifier_config.json (editable via /scanner/config API).

Fixes:
  - Email password no longer corrupted when frontend saves masked config
  - Telegram errors now return specific failure reasons
  - Config save merges selectively (never overwrites real password with mask)
"""

import json
import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests

CONFIG_FILE    = "notifier_config.json"
PASSWORD_MASK  = "••••••••"

_DEFAULT_CONFIG = {
    "telegram_token":   "",
    "telegram_chat_id": "",
    "email_enabled":    False,
    "email_sender":     "",
    "email_password":   "",
    "email_recipients": [],
}


# ══════════════════════════════════════════════════════════════
#  CONFIG  (read / write)
# ══════════════════════════════════════════════════════════════

def load_config() -> dict:
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE) as f:
                stored = json.load(f)
            return {**_DEFAULT_CONFIG, **stored}
        except Exception:
            pass
    return dict(_DEFAULT_CONFIG)


def save_config(incoming: dict) -> dict:
    """
    Merge incoming payload into the existing config.
    CRITICAL: if the frontend sends back the password mask, keep the
    real password that's already on disk — never overwrite with the mask.
    """
    existing = load_config()
    merged   = {**existing}

    for key, value in incoming.items():
        # Skip the masked placeholder so we never corrupt the real password
        if key == "email_password" and value == PASSWORD_MASK:
            continue
        merged[key] = value

    # Ensure required keys always present
    for k, v in _DEFAULT_CONFIG.items():
        merged.setdefault(k, v)

    with open(CONFIG_FILE, "w") as f:
        json.dump(merged, f, indent=2)

    return merged


def get_safe_config() -> dict:
    """Returns config with password masked — safe to send to frontend."""
    cfg  = load_config()
    safe = dict(cfg)
    if safe.get("email_password"):
        safe["email_password"] = PASSWORD_MASK
    return safe


# ══════════════════════════════════════════════════════════════
#  TELEGRAM
# ══════════════════════════════════════════════════════════════

def send_telegram(message: str) -> dict:
    """
    Send a Telegram message.
    Returns {"success": bool, "message": str} with a specific reason on failure.
    """
    cfg   = load_config()
    token = cfg.get("telegram_token", "").strip()
    chat  = cfg.get("telegram_chat_id", "").strip()

    # ── Pre-flight checks ──────────────────────────────────────
    if not token:
        reason = "Bot token is empty — paste your token from @BotFather"
        print(f"[Telegram] {reason}")
        return {"success": False, "message": reason}

    if not chat:
        reason = "Chat ID is empty — paste your ID from @userinfobot"
        print(f"[Telegram] {reason}")
        return {"success": False, "message": reason}

    # Basic token format check: should be  <digits>:<alphanum>
    if ":" not in token or len(token) < 20:
        reason = "Bot token format looks wrong — should be like 123456789:ABC..."
        print(f"[Telegram] {reason}")
        return {"success": False, "message": reason}

    # ── API call ───────────────────────────────────────────────
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        res = requests.post(url, json={
            "chat_id":    chat,
            "text":       message,
            "parse_mode": "HTML",
        }, timeout=10)

        data = res.json()

        if res.status_code == 200 and data.get("ok"):
            print("[Telegram] ✓ Message sent successfully")
            return {"success": True, "message": "Message sent!"}

        # ── Map Telegram error codes to human-readable reasons ──
        error_code = data.get("error_code")
        description = data.get("description", "Unknown error")

        if error_code == 401:
            reason = "Invalid bot token — re-copy it from @BotFather"
        elif error_code == 400 and "chat not found" in description.lower():
            reason = (
                "Chat not found — make sure you sent at least one message "
                "to your bot first (open Telegram → find your bot → send /start)"
            )
        elif error_code == 400 and "blocked" in description.lower():
            reason = "Bot was blocked by the user — unblock the bot in Telegram"
        elif error_code == 403:
            reason = "Bot was kicked or blocked — send /start to your bot again"
        else:
            reason = f"Telegram error {error_code}: {description}"

        print(f"[Telegram] Failed — {reason}")
        return {"success": False, "message": reason}

    except requests.exceptions.ConnectionError:
        reason = "No internet connection — check your network"
        print(f"[Telegram] {reason}")
        return {"success": False, "message": reason}
    except requests.exceptions.Timeout:
        reason = "Request timed out — Telegram may be slow, try again"
        print(f"[Telegram] {reason}")
        return {"success": False, "message": reason}
    except Exception as e:
        reason = f"Unexpected error: {e}"
        print(f"[Telegram] {reason}")
        return {"success": False, "message": reason}


def test_telegram() -> dict:
    """Send a test message to verify config."""
    msg = (
        "✅ <b>Stock Scanner Connected!</b>\n\n"
        "Your Telegram alerts are working correctly.\n"
        "You'll receive pattern alerts here during market hours "
        "(9:15 AM – 3:30 PM IST).\n\n"
        "📊 <i>Paper Trade Arena — Stock Scanner</i>"
    )
    return send_telegram(msg)


# ══════════════════════════════════════════════════════════════
#  EMAIL
# ══════════════════════════════════════════════════════════════

def send_email(subject: str, html_body: str) -> dict:
    """
    Send an email alert.
    Returns {"success": bool, "message": str}.
    """
    cfg = load_config()

    if not cfg.get("email_enabled"):
        return {"success": False, "message": "Email alerts are disabled"}

    sender     = cfg.get("email_sender", "").strip()
    password   = cfg.get("email_password", "").strip()
    recipients = [r.strip() for r in cfg.get("email_recipients", []) if r.strip()]

    if not sender:
        return {"success": False, "message": "Gmail sender address is empty"}
    if not password or password == PASSWORD_MASK:
        return {"success": False, "message": "Gmail App Password is empty or not saved"}
    if not recipients:
        return {"success": False, "message": "No recipients configured"}

    try:
        msg             = MIMEMultipart("alternative")
        msg["Subject"]  = subject
        msg["From"]     = f"Stock Scanner <{sender}>"
        msg["To"]       = ", ".join(recipients)
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
            server.login(sender, password)
            server.sendmail(sender, recipients, msg.as_string())

        print(f"[Email] ✓ Sent to {recipients}")
        return {"success": True, "message": f"Email sent to {', '.join(recipients)}"}

    except smtplib.SMTPAuthenticationError:
        reason = (
            "Gmail authentication failed — make sure you're using an App Password "
            "(not your Google login). Generate at: Google Account → Security → 2FA → App Passwords"
        )
        print(f"[Email] {reason}")
        return {"success": False, "message": reason}
    except smtplib.SMTPRecipientsRefused:
        reason = "One or more recipient addresses were rejected by Gmail"
        print(f"[Email] {reason}")
        return {"success": False, "message": reason}
    except Exception as e:
        reason = f"Email error: {e}"
        print(f"[Email] {reason}")
        return {"success": False, "message": reason}


def test_email() -> dict:
    """Send a test email to verify config."""
    html = _build_email_html(
        ticker       = "TEST",
        name         = "Test Stock",
        pattern_name = "Test Pattern",
        direction    = "BUY",
        details      = "This is a test alert — your email is configured correctly.",
        price        = 1234.56,
        category     = "Test",
        confidence   = 85,
    )
    result = send_email("[Stock Scanner] ✅ Email Test", html)
    return result


def generate_portfolio_insight(alert: dict, portfolio: dict) -> str:
    try:
        from groq import Groq
        from dotenv import load_dotenv
        load_dotenv()

        api_key = os.getenv("GROQ_API_KEY", "").strip()
        if not api_key:
            return ""

        client     = Groq(api_key=api_key)
        cash       = portfolio.get("cash_balance", 0)
        total      = portfolio.get("total_value", 0)
        pnl        = portfolio.get("overall_pnl", 0)
        pnl_pct    = portfolio.get("overall_pnl_pct", 0)
        holdings   = portfolio.get("holdings", [])
        price      = alert.get("price", 1)
        safe_price = max(price, 1)

        suggested_qty = max(1, int((total * 0.10) / safe_price))
        trade_value   = round(suggested_qty * safe_price, 2)
        cash_after    = round(cash - trade_value, 2)
        portfolio_pct = round((trade_value / max(total, 1)) * 100, 1)

        holdings_text = "No open positions." if not holdings else "\n".join([
            f"  - {h['ticker']} ({h['direction']}) | Qty: {h['qty']} | "
            f"Buy: ₹{h['buy_price']} | LTP: ₹{h['current_price']} | "
            f"P&L: ₹{h['unrealised_pnl']} ({h['return_pct']}%)"
            for h in holdings
        ])

        prompt = f"""
Stock    : {alert.get('name')} ({alert.get('ticker')}) | {alert.get('direction')}
Pattern  : {alert.get('pattern')} [{alert.get('category')}] | Confidence: {alert.get('confidence')}%
Price    : ₹{price} | Buy Score: {alert.get('buy_score', 0)} | Sell Score: {alert.get('sell_score', 0)}
Signal   : {alert.get('details')}

Portfolio: Cash ₹{round(cash):,} | Total ₹{round(total):,} | P&L ₹{round(pnl):,} ({pnl_pct}%) | {len(holdings)} open positions
{holdings_text}

Proposed Trade: {suggested_qty} shares × ₹{price} = ₹{trade_value:,} | Cash after: ₹{cash_after:,} | {portfolio_pct}% of portfolio

Write exactly 4 complete sentences:
1. What this pattern means and its reliability
2. Exact cash and exposure impact using the numbers above
3. Risk given current P&L and open positions
4. Final line must be: RECOMMENDATION: ACT / WAIT / AVOID — [one reason]
Every sentence must end with a full stop. Stop after sentence 4.
"""
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a concise paper trading advisor. Be specific, use actual numbers. "
                        "Plain English only — no markdown, no bullets, no headers. "
                        "Exactly 4 sentences. Every sentence ends with a full stop. Stop after sentence 4."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            reasoning_effort="low",
            max_completion_tokens=1024,
        )
        insight = response.choices[0].message.content.strip()
        print(f"[Groq] ✓ Insight for {alert.get('ticker')}")
        return insight

    except Exception as e:
        print(f"[Groq] Error: {e}")
        return ""


# ══════════════════════════════════════════════════════════════
#  MAIN ALERT DISPATCHER
# ══════════════════════════════════════════════════════════════

def send_alert(
    ticker:       str,
    name:         str,
    pattern_name: str,
    direction:    str,
    details:      str,
    price:        float,
    category:     str  = "",
    confidence:   int  = None,
    buy_score:    int  = None,
    sell_score:   int  = None,
    portfolio:    dict = None,
):
    emoji    = "🟢" if direction == "BUY" else "🔴" if direction == "SELL" else "🟡"
    # ── AI Portfolio Insight ───────────────────────────────────
    ai_block = ""
    if portfolio:
        alert_data = {
            "ticker": ticker, "name": name, "pattern": pattern_name,
            "direction": direction, "details": details, "price": price,
            "category": category, "confidence": confidence,
            "buy_score": buy_score or 0, "sell_score": sell_score or 0,
        }
        insight = generate_portfolio_insight(alert_data, portfolio)
        if insight:
            ai_block = f"\n\n💡 <b>AI Portfolio Analysis:</b>\n{insight}"
    time_str = datetime.now().strftime("%d %b %Y %H:%M IST")

    # ── Confidence line (only shown if available) ──────────────
    conf_line = ""
    if confidence is not None:
        conf_line = f"📊 Confidence : <b>{confidence}%</b>\n"
    if buy_score is not None and sell_score is not None and (buy_score > 0 or sell_score > 0):
        conf_line += f"   ▲ BUY {buy_score}  vs  ▼ SELL {sell_score}\n"

    cat_label = f" [{category}]" if category else ""

    # ── Telegram ──────────────────────────────────────────────
    tg_msg = (
        f"{emoji} <b>Final Signal{cat_label}</b>\n\n"
        f"📌 <b>{name}</b> <code>({ticker})</code>\n"
        f"📈 Decision  : <b>{direction}</b>\n"
        f"🔍 Pattern   : <b>{pattern_name}</b>\n"
        f"{conf_line}"
        f"💰 Price     : <b>₹{price:.2f}</b>\n"
        f"ℹ️ {details}"
        f"{ai_block}\n\n"
        f"🕐 {time_str}\n"
        f"⚠️ <i>Not financial advice. Paper trade only.</i>"
    )
    send_telegram(tg_msg)

    # ── Email ─────────────────────────────────────────────────
    html = _build_email_html(
        ticker, name, pattern_name, direction,
        details, price, category, confidence,
    )
    send_email(f"[Stock Scanner] {emoji} {direction} — {ticker} ({pattern_name})", html)


def _build_email_html(
    ticker:       str,
    name:         str,
    pattern_name: str,
    direction:    str,
    details:      str,
    price:        float,
    category:     str,
    confidence:   int = None,
) -> str:
    color    = "#22c55e" if direction == "BUY" else "#ef4444" if direction == "SELL" else "#f59e0b"
    emoji    = "🟢"      if direction == "BUY" else "🔴"      if direction == "SELL" else "🟡"
    time_str = datetime.now().strftime("%d %b %Y %H:%M IST")

    conf_row = ""
    if confidence is not None:
        bar_width = confidence
        conf_row = f"""
          <tr style="border-bottom:1px solid #334155;">
            <td style="padding:12px 0;color:#94a3b8;font-size:13px;width:120px;">Confidence</td>
            <td style="padding:12px 0;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="flex:1;height:6px;border-radius:99px;background:#1e293b;overflow:hidden;">
                  <div style="width:{bar_width}%;height:100%;background:{color};border-radius:99px;"></div>
                </div>
                <span style="color:{color};font-weight:800;font-size:14px;">{confidence}%</span>
              </div>
            </td>
          </tr>"""

    return f"""
    <html>
    <body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
      <div style="max-width:520px;margin:32px auto;background:#1e293b;border-radius:16px;
                  padding:32px;border:1px solid #334155;box-shadow:0 8px 32px rgba(0,0,0,0.4);">

        <!-- Header -->
        <div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #334155;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:32px;">{emoji}</span>
            <div>
              <h2 style="margin:0;color:{color};font-size:22px;letter-spacing:-0.5px;">
                {direction} Signal
              </h2>
              <p style="margin:4px 0 0;color:#64748b;font-size:13px;">
                {category} &nbsp;·&nbsp; {time_str}
              </p>
            </div>
          </div>
        </div>

        <!-- Data table -->
        <table style="width:100%;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #334155;">
            <td style="padding:12px 0;color:#94a3b8;font-size:13px;width:120px;">Stock</td>
            <td style="padding:12px 0;color:#f1f5f9;font-weight:700;font-size:15px;">
              {name}
              <span style="color:#64748b;font-weight:400;font-size:13px;"> ({ticker})</span>
            </td>
          </tr>
          <tr style="border-bottom:1px solid #334155;">
            <td style="padding:12px 0;color:#94a3b8;font-size:13px;">Pattern</td>
            <td style="padding:12px 0;color:#f1f5f9;font-weight:700;">{pattern_name}</td>
          </tr>
          <tr style="border-bottom:1px solid #334155;">
            <td style="padding:12px 0;color:#94a3b8;font-size:13px;">Signal</td>
            <td style="padding:12px 0;font-weight:900;font-size:18px;color:{color};">{direction}</td>
          </tr>
          {conf_row}
          <tr style="border-bottom:1px solid #334155;">
            <td style="padding:12px 0;color:#94a3b8;font-size:13px;">Price</td>
            <td style="padding:12px 0;color:#f1f5f9;font-weight:700;font-size:17px;">₹{price:.2f}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;color:#94a3b8;font-size:13px;vertical-align:top;">Details</td>
            <td style="padding:12px 0;color:#cbd5e1;line-height:1.6;">{details}</td>
          </tr>
        </table>

        <!-- Disclaimer -->
        <div style="margin-top:24px;padding:12px 16px;background:#0f172a;border-radius:8px;
                    border-left:3px solid {color};">
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">
            ⚠️ This alert is generated for educational and paper trading purposes only.
            It does not constitute financial advice. Always do your own research.
          </p>
        </div>

        <p style="margin-top:20px;color:#475569;font-size:12px;text-align:center;">
          Paper Trade Arena — Stock Pattern Scanner
        </p>
      </div>
    </body>
    </html>
    """