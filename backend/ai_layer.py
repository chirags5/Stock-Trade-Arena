import os
from dotenv import load_dotenv
from groq import Groq
from backtest import get_win_rate

# Load API key from .env file
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY not found. Check your .env file.")

client = Groq(api_key=GROQ_API_KEY)
MODEL  = "openai/gpt-oss-120b"


def generate_signal_explanation(ticker, stock_name, pattern,
                                 direction, price, volume_ratio):
    """
    Calls GPT-OSS 120B on Groq.
    Sends pattern data and gets back plain English explanation
    and conviction score for a first-time Indian retail investor.
    """

    win_rate, occurrences = get_win_rate(ticker, pattern)

    direction_word = "buy" if direction == "BUY" else "short sell"

    prompt = f"""You are an expert stock market analyst explaining signals 
to first-time Indian retail investors in simple, clear language.

Here is the signal data:
- Stock: {stock_name} ({ticker})  
- Current Price: ₹{price}
- Pattern Detected: {pattern}
- Signal Direction: {direction} (suggesting to {direction_word})
- Volume today vs average: {volume_ratio}x above average
- Historical win rate of this pattern on {ticker}: {win_rate}% 
  (appeared {occurrences} times in last 2 years)

Write a 2-3 sentence explanation of this signal for a beginner investor.
Use simple language. Mention the pattern, the win rate, and what it means.
Then on a new line write: CONVICTION: <number between 0 and 100>

Only output the explanation and the conviction score. Nothing else."""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.7,
        )

        raw = response.choices[0].message.content.strip()
        explanation, conviction = parse_response(raw, win_rate)

        return {
            "explanation": explanation,
            "conviction":  conviction,
            "win_rate":    win_rate,
            "occurrences": occurrences,
        }

    except Exception as e:
        print(f"Groq API error for {ticker}: {e}")
        # Fallback if API call fails
        return {
            "explanation": (
                f"{stock_name} has shown a {pattern} signal at ₹{price}. "
                f"This pattern has historically worked {win_rate}% of the time "
                f"on this stock over the last 2 years. "
                f"Volume is {volume_ratio}x above average, confirming the signal."
            ),
            "conviction":  int(win_rate),
            "win_rate":    win_rate,
            "occurrences": occurrences,
        }


def parse_response(raw_text, fallback_win_rate):
    """
    Splits the AI response into explanation text and conviction score.
    """
    lines = raw_text.strip().split("\n")

    conviction        = int(fallback_win_rate)
    explanation_lines = []

    for line in lines:
        if line.upper().startswith("CONVICTION:"):
            try:
                score = line.split(":")[1].strip()
                score = "".join(filter(str.isdigit, score))
                conviction = max(0, min(100, int(score)))
            except Exception:
                pass
        else:
            if line.strip():
                explanation_lines.append(line.strip())

    explanation = " ".join(explanation_lines).strip()
    return explanation, conviction


def process_signals(raw_signals):
    """
    Takes raw pattern signals from patterns.py,
    calls AI for each one,
    returns enriched signals ready to save to database.
    """
    enriched = []

    for signal in raw_signals:
        ticker       = signal["ticker"]
        stock_name   = signal["stock_name"]
        pattern      = signal["pattern"]
        direction    = signal["direction"]
        price        = signal["price"]
        details      = signal.get("details", {})
        volume_ratio = details.get("volume_ratio", 1.0)

        print(f"  Generating explanation for {ticker} — {pattern}...")

        result = generate_signal_explanation(
            ticker, stock_name, pattern,
            direction, price, volume_ratio
        )

        enriched.append({
            "ticker":      ticker,
            "stock_name":  stock_name,
            "pattern":     pattern,
            "direction":   direction,
            "price":       price,
            "win_rate":    result["win_rate"],
            "conviction":  result["conviction"],
            "explanation": result["explanation"],
        })

    return enriched


if __name__ == "__main__":
    from database import init_db
    init_db()

    print("=== Testing AI Layer ===\n")
    print("Sending test signal to GPT-OSS 120B on Groq...\n")

    test_result = generate_signal_explanation(
        ticker       = "RELIANCE",
        stock_name   = "Reliance Industries",
        pattern      = "Bullish Flag Breakout",
        direction    = "BUY",
        price        = 2847.0,
        volume_ratio = 2.4,
    )

    print("Explanation:")
    print(test_result["explanation"])
    print(f"\nConviction Score : {test_result['conviction']}/100")
    print(f"Win Rate         : {test_result['win_rate']}%")
    print(f"Occurrences      : {test_result['occurrences']} times in 2 years")
    print("\nAll good! Run next: python app.py")
