import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function SignalFeed({ API, prices, onTrade }) {
  const [signals, setSignals]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [acted, setActed]       = useState({});
  const [quantities, setQty]    = useState({});
  const [message, setMessage]   = useState(null);

  useEffect(() => {
    fetchSignals();
  }, []);

  async function fetchSignals() {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/signals`);
      setSignals(res.data.signals || []);
    } catch (e) {
      console.error('Signal fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  function getQty(signalId) {
    return quantities[signalId] || 1;
  }

  function showMessage(msg, isError = false) {
    setMessage({ text: msg, isError });
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleBuy(signal) {
    const qty       = getQty(signal.id);
    const buyPrice  = prices[signal.ticker] || signal.price;
    const cost      = qty * buyPrice;

    try {
      await axios.post(`${API}/trade`, {
        signal_id: signal.id,
        ticker:    signal.ticker,
        direction: signal.direction,
        qty:       qty,
        buy_price: buyPrice,
      });
      setActed(prev => ({ ...prev, [signal.id]: 'bought' }));
      showMessage(`Bought ${qty} × ${signal.ticker} @ ₹${buyPrice}. Cost: ₹${cost.toLocaleString('en-IN')}`);
      onTrade();
    } catch (e) {
      const msg = e.response?.data?.detail || 'Trade failed';
      showMessage(msg, true);
    }
  }

  function handleSkip(signal) {
    setActed(prev => ({ ...prev, [signal.id]: 'skipped' }));
    showMessage(`Skipped ${signal.ticker} signal`);
  }

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.loadingText}>Scanning NSE stocks for patterns...</div>
        <div style={styles.loadingSub}>This may take 30–60 seconds on first load</div>
      </div>
    );
  }

  if (!signals.length) {
    return (
      <div style={styles.center}>
        <div style={styles.loadingText}>No patterns detected today</div>
        <div style={styles.loadingSub}>
          Patterns don't appear every day. Check back tomorrow or click refresh.
        </div>
        <button style={styles.refreshBtn} onClick={fetchSignals}>
          Refresh Signals
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Toast message */}
      {message && (
        <div style={{
          ...styles.toast,
          backgroundColor: message.isError ? '#fef2f2' : '#f0fdf4',
          borderColor:     message.isError ? '#fca5a5' : '#86efac',
          color:           message.isError ? '#dc2626' : '#16a34a',
        }}>
          {message.text}
        </div>
      )}

      <div style={styles.feedHeader}>
        <div style={styles.feedTitle}>Today's AI Signals</div>
        <button style={styles.refreshBtn} onClick={fetchSignals}>
          Refresh
        </button>
      </div>

      {signals.map(signal => {
        const isActed       = !!acted[signal.id];
        const currentPrice  = prices[signal.ticker] || signal.price;
        const qty           = getQty(signal.id);
        const cost          = qty * currentPrice;
        const isBuy         = signal.direction === 'BUY';

        return (
          <div
            key={signal.id}
            style={{
              ...styles.card,
              opacity: isActed ? 0.4 : 1,
              pointerEvents: isActed ? 'none' : 'auto',
            }}
          >
            {/* Card Header */}
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.ticker}>{signal.ticker}
                  <span style={styles.stockName}> — {signal.stock_name}</span>
                </div>
                <div style={styles.priceRow}>
                  ₹{currentPrice} &nbsp;·&nbsp;
                  <span style={{
                    color: isBuy ? '#16a34a' : '#dc2626',
                    fontWeight: '600',
                  }}>
                    {isBuy ? 'BUY signal' : 'SHORT signal'}
                  </span>
                </div>
              </div>

              {/* Conviction Score */}
              <div style={styles.convWrap}>
                <div style={styles.convLabel}>Conviction</div>
                <div style={styles.convScore(signal.conviction)}>
                  {signal.conviction}/100
                </div>
              </div>
            </div>

            {/* Pattern Badge */}
            <div style={{
              ...styles.badge,
              backgroundColor: isBuy ? '#f0fdf4' : '#fef2f2',
              color:           isBuy ? '#16a34a' : '#dc2626',
              borderColor:     isBuy ? '#86efac' : '#fca5a5',
            }}>
              {signal.pattern} &nbsp;·&nbsp; {signal.win_rate}% historical win rate
            </div>

            {/* Conviction Bar */}
            <div style={styles.barBg}>
              <div style={{
                ...styles.barFill,
                width: `${signal.conviction}%`,
                backgroundColor: signal.conviction >= 70
                  ? '#16a34a' : signal.conviction >= 50
                  ? '#d97706' : '#dc2626',
              }} />
            </div>

            {/* AI Explanation */}
            <div style={styles.aiBox}>
              <div style={styles.aiLabel}>Claude AI Explanation</div>
              <div style={styles.aiText}>{signal.explanation}</div>
            </div>

            {/* Actions */}
            <div style={styles.actions}>
              <span style={styles.qtyLabel}>Qty:</span>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={e => setQty(prev => ({
                  ...prev,
                  [signal.id]: Math.max(1, parseInt(e.target.value) || 1)
                }))}
                style={styles.qtyInput}
              />
              <button
                onClick={() => handleBuy(signal)}
                style={{
                  ...styles.buyBtn,
                  backgroundColor: isBuy ? '#16a34a' : '#dc2626',
                }}
              >
                {isBuy ? 'Buy' : 'Short'}
              </button>
              <button
                onClick={() => handleSkip(signal)}
                style={styles.skipBtn}
              >
                Skip
              </button>
              <span style={styles.costLabel}>
                Cost: ₹{cost.toLocaleString('en-IN')}
              </span>
            </div>

            {isActed && (
              <div style={styles.actedBanner}>
                {acted[signal.id] === 'bought' ? 'Trade placed!' : 'Skipped'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  center: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  loadingText: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '8px',
  },
  loadingSub: {
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '16px',
  },
  toast: {
    border: '1px solid',
    borderRadius: '8px',
    padding: '10px 16px',
    marginBottom: '16px',
    fontSize: '13px',
    fontWeight: '500',
  },
  feedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  feedTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  refreshBtn: {
    padding: '6px 14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    background: '#ffffff',
    fontSize: '12px',
    color: '#374151',
    cursor: 'pointer',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '18px 20px',
    marginBottom: '14px',
    transition: 'opacity 0.3s',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '10px',
  },
  ticker: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  stockName: {
    fontSize: '13px',
    fontWeight: '400',
    color: '#6b7280',
  },
  priceRow: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '3px',
  },
  convWrap: {
    textAlign: 'right',
  },
  convLabel: {
    fontSize: '10px',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '2px',
  },
  convScore: (score) => ({
    fontSize: '20px',
    fontWeight: '700',
    color: score >= 70 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626',
  }),
  badge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: '500',
    padding: '3px 10px',
    borderRadius: '99px',
    border: '1px solid',
    marginBottom: '10px',
  },
  barBg: {
    height: '5px',
    backgroundColor: '#f3f4f6',
    borderRadius: '99px',
    marginBottom: '12px',
  },
  barFill: {
    height: '5px',
    borderRadius: '99px',
    transition: 'width 0.4s',
  },
  aiBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderLeft: '3px solid #3b82f6',
    borderRadius: '6px',
    padding: '10px 12px',
    marginBottom: '14px',
  },
  aiLabel: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#3b82f6',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '4px',
  },
  aiText: {
    fontSize: '13px',
    color: '#374151',
    lineHeight: '1.6',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  qtyLabel: {
    fontSize: '12px',
    color: '#6b7280',
  },
  qtyInput: {
    width: '65px',
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#1a1a1a',
  },
  buyBtn: {
    padding: '7px 20px',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  skipBtn: {
    padding: '7px 14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    background: 'transparent',
    color: '#6b7280',
    fontSize: '13px',
    cursor: 'pointer',
  },
  costLabel: {
    fontSize: '12px',
    color: '#9ca3af',
  },
  actedBanner: {
    marginTop: '10px',
    fontSize: '12px',
    color: '#16a34a',
    fontWeight: '500',
  },
};