import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API = 'http://localhost:8000';

// ── Design tokens ─────────────────────────────────────────────
const DIR = {
  BUY:     { color: '#22c55e', bg: '#22c55e18', border: '#22c55e44', label: '▲ BUY',     emoji: '🟢' },
  SELL:    { color: '#ef4444', bg: '#ef444418', border: '#ef444444', label: '▼ SELL',    emoji: '🔴' },
  NEUTRAL: { color: '#f59e0b', bg: '#f59e0b18', border: '#f59e0b44', label: '◆ NEUTRAL', emoji: '🟡' },
};

const CAT_COLOR = {
  'Candlestick':   '#818cf8',
  'Chart Pattern': '#f59e0b',
  'S/R Breakout':  '#22d3ee',
};

// Pattern weights — mirrors scanner.py so frontend can resolve old-format alerts too
const PATTERN_WEIGHTS = {
  'Resistance Breakout': 5, 'Support Breakdown': 5,
  'Head & Shoulders': 4, 'Double Top': 4, 'Double Bottom': 4, 'Bull Flag Breakout': 4,
  'Ascending Triangle': 3, 'Descending Triangle': 3,
  'Symmetrical Triangle Breakout': 3, 'Symmetrical Triangle Breakdown': 3,
  'Morning Star': 3, 'Evening Star': 3,
  'Bullish Engulfing': 2, 'Bearish Engulfing': 2, 'Hammer': 2, 'Shooting Star': 2,
  'Inverted Hammer': 1, 'Doji': 1,
};

/**
 * Client-side signal resolver — used as a fallback for old-format alerts
 * that don't yet have backend-resolved fields.
 */
function resolveSignal(patterns) {
  let buyScore = 0, sellScore = 0;
  for (const p of patterns) {
    const w = PATTERN_WEIGHTS[p.pattern] || 1;
    if (p.direction === 'BUY')  buyScore  += w;
    if (p.direction === 'SELL') sellScore += w;
  }
  const total = buyScore + sellScore;
  let direction, confidence;
  if (total === 0) {
    direction  = 'NEUTRAL';
    confidence = 50;
  } else {
    const ratio = (buyScore - sellScore) / total;
    if      (ratio >  0.25) { direction = 'BUY';     confidence = Math.round(50 + ratio * 50); }
    else if (ratio < -0.25) { direction = 'SELL';    confidence = Math.round(50 + Math.abs(ratio) * 50); }
    else                    { direction = 'NEUTRAL';  confidence = Math.round(50 - Math.abs(ratio) * 50); }
  }
  const winners = patterns.filter(p =>
    direction === 'NEUTRAL' ? true : p.direction === direction
  );
  const primary = [...winners].sort(
    (a, b) => (PATTERN_WEIGHTS[b.pattern] || 1) - (PATTERN_WEIGHTS[a.pattern] || 1)
  )[0] || patterns[0];

  return { direction, confidence, buyScore, sellScore, primary };
}

/**
 * Group raw alerts array (which may be old multi-pattern format) into
 * one resolved entry per ticker — this is the core fix.
 */
function groupByStock(alerts) {
  const map = {};
  for (const a of alerts) {
    if (!map[a.ticker]) map[a.ticker] = [];
    map[a.ticker].push(a);
  }

  return Object.values(map).map(group => {
    group.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latest = group[0];

    // If backend already resolved (new format), use as-is
    if (latest.all_patterns && latest.confidence != null) return latest;

    // Otherwise resolve client-side from all patterns for this ticker
    const allPatterns = group.map(a => ({
      pattern:   a.pattern,
      direction: a.direction,
      category:  a.category,
      details:   a.details,
    }));
    const { direction, confidence, buyScore, sellScore, primary } = resolveSignal(allPatterns);

    return {
      ...latest,
      direction,
      confidence,
      buy_score:    buyScore,
      sell_score:   sellScore,
      pattern:      primary.pattern,
      category:     primary.category,
      details:      primary.details,
      all_patterns: allPatterns,
    };
  });
}

// ── Tiny shared components ────────────────────────────────────

function Badge({ label, color }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999, fontSize: 11,
      fontWeight: 700, background: color + '22', color,
      border: `1px solid ${color}55`, letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'var(--glass-bg, rgba(30,41,59,0.8))',
      border: '1px solid var(--glass-border, rgba(148,163,184,0.12))',
      borderRadius: 14, padding: '20px 22px',
      backdropFilter: 'blur(12px)', ...style,
    }}>{children}</div>
  );
}

function SectionTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
        {children}
      </h3>
      {right}
    </div>
  );
}

function IconBtn({ onClick, title, children, danger }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? (danger ? '#ef444422' : 'rgba(148,163,184,0.15)') : 'transparent',
        border: 'none', borderRadius: 7, padding: '4px 8px', cursor: 'pointer',
        color: danger ? '#ef4444' : 'var(--text-secondary, #94a3b8)',
        fontSize: 15, transition: 'all 0.15s', lineHeight: 1,
      }}>{children}</button>
  );
}

// ── Confidence bar ────────────────────────────────────────────

function ConfidenceBar({ value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1, height: 5, borderRadius: 99,
        background: 'rgba(148,163,184,0.12)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${value}%`, height: '100%', background: color,
          borderRadius: 99, transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 800, minWidth: 36 }}>{value}%</span>
    </div>
  );
}

// ── Score pills ───────────────────────────────────────────────

function ScorePills({ buyScore, sellScore }) {
  if (buyScore == null && sellScore == null) return null;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
        background: '#22c55e18', color: '#22c55e', border: '1px solid #22c55e33',
      }}>▲ BUY {buyScore}</span>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>vs</span>
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
        background: '#ef444418', color: '#ef4444', border: '1px solid #ef444433',
      }}>▼ SELL {sellScore}</span>
    </div>
  );
}

// ── Supporting patterns list (collapsed by default) ───────────

function SupportingPatterns({ patterns }) {
  const [open, setOpen] = useState(false);
  if (!patterns || patterns.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span style={{
          width: 16, height: 16, borderRadius: 4,
          background: 'rgba(148,163,184,0.12)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 900,
        }}>{open ? '▲' : '▼'}</span>
        {patterns.length} pattern{patterns.length > 1 ? 's' : ''} analysed
      </button>

      {open && (
        <div style={{
          marginTop: 8, borderRadius: 9,
          background: 'rgba(15,23,42,0.5)',
          border: '1px solid rgba(148,163,184,0.1)', overflow: 'hidden',
        }}>
          {patterns.map((p, i) => {
            const dc = DIR[p.direction]?.color || '#94a3b8';
            const cc = CAT_COLOR[p.category]   || '#94a3b8';
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '9px 12px',
                borderTop: i > 0 ? '1px solid rgba(148,163,184,0.07)' : 'none',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: dc, flexShrink: 0, marginTop: 5,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: dc }}>{p.direction}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{p.pattern}</span>
                    <Badge label={p.category} color={cc} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
                    {p.details}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PortfolioImpact({ alert, portfolio }) {
  const [open,       setOpen]       = useState(false);
  const [insight,    setInsight]    = useState(null);
  const [insightFor, setInsightFor] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const abortRef                    = useRef(null);

  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  const fetchInsight = async () => {
    const alertKey = `${alert.ticker}_${alert.direction}_${alert.pattern}`;
    if (insightFor === alertKey && insight) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true); setError(null); setInsight(null);
    try {
      const res = await axios.post(
        `${API}/scanner/portfolio-insight`,
        {
          alert: {
            ticker:     alert.ticker,    name:       alert.name,
            direction:  alert.direction, pattern:    alert.pattern,
            category:   alert.category, confidence: alert.confidence,
            price:      alert.price,    buy_score:  alert.buy_score,
            sell_score: alert.sell_score,
            details:    (alert.details || '').split(' | Signal resolved')[0],
          },
          portfolio,
        },
        { signal: abortRef.current.signal },
      );
      if (res.data.success) { setInsight(res.data.insight); setInsightFor(alertKey); }
      else setError(res.data.error || 'Failed to generate insight');
    } catch (e) {
      if (axios.isCancel(e) || e.name === 'CanceledError') return;
      setError('Could not connect to AI');
    }
    setLoading(false);
  };

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && !loading) fetchInsight();
  };

  if (!portfolio) return null;

  const price        = alert.price || 0;
  const safePrice    = Math.max(price, 1);
  const cash         = portfolio.cash_balance || 0;
  const total        = Math.max(portfolio.total_value || 0, 1);
  const suggestedQty = Math.max(1, Math.floor((total * 0.10) / safePrice));
  const tradeValue   = Math.round(suggestedQty * safePrice);
  const cashAfter    = Math.round(cash - tradeValue);
  const portfolioPct = ((tradeValue / total) * 100).toFixed(1);
  const canAfford    = cashAfter >= 0;

  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={handleOpen} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span style={{
          width: 16, height: 16, borderRadius: 4, background: 'rgba(129,140,248,0.15)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 900, color: '#818cf8',
        }}>{open ? '▲' : '▼'}</span>
        <span style={{ color: '#818cf8' }}>🤖 AI Portfolio Impact</span>
        {!canAfford && (
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 99,
            background: '#ef444418', color: '#ef4444',
            border: '1px solid #ef444433', fontWeight: 700,
          }}>⚠️ Low Cash</span>
        )}
      </button>

      {open && (
        <div style={{
          marginTop: 8, borderRadius: 9, overflow: 'hidden',
          background: 'rgba(15,23,42,0.6)',
          border: '1px solid rgba(129,140,248,0.15)',
        }}>
          {/* Quick numbers bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
            {[
              { label: 'Suggested Qty', value: suggestedQty },
              { label: 'Trade Value',   value: `₹${tradeValue.toLocaleString('en-IN')}` },
              { label: 'Cash After',    value: `₹${cashAfter.toLocaleString('en-IN')}`, color: canAfford ? '#22c55e' : '#ef4444' },
              { label: 'Portfolio %',   value: `${portfolioPct}%` },
            ].map((item, i) => (
              <div key={i} style={{
                flex: 1, padding: '10px 12px', textAlign: 'center',
                borderLeft: i > 0 ? '1px solid rgba(148,163,184,0.08)' : 'none',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 600 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: item.color || 'var(--text-primary)' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* AI text */}
          <div style={{ padding: '12px 14px' }}>
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#818cf8', fontSize: 13 }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                Analysing your portfolio with AI…
              </div>
            )}
            {error && !loading && (
              <div style={{ color: '#ef4444', fontSize: 12 }}>❌ {error}</div>
            )}
            {insight && !loading && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                {insight}
              </div>
            )}
          </div>

          <div style={{
            padding: '8px 12px', borderTop: '1px solid rgba(148,163,184,0.06)',
            fontSize: 10, color: '#475569', fontStyle: 'italic',
          }}>
            ⚠️ AI analysis for educational/paper trading only. Not financial advice.
          </div>
        </div>
      )}
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  STOCK DECISION CARD  — one per stock, shows final signal
// ══════════════════════════════════════════════════════════════

function StockDecisionCard({ alert, portfolio }) {
  const dir    = DIR[alert.direction] || DIR.NEUTRAL;
  const cColor = CAT_COLOR[alert.category] || '#94a3b8';
  const hasConflict = alert.buy_score > 0 && alert.sell_score > 0;

  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden',
      border: `1px solid ${dir.border}`,
      background: 'var(--glass-header, rgba(15,23,42,0.5))',
    }}>
      {/* Coloured top bar */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, ${dir.color} 0%, ${dir.color}44 100%)`,
      }} />

      <div style={{ padding: '16px 18px' }}>

        {/* Row 1: Final signal pill + ticker + price */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* BIG direction pill — the answer */}
            <span style={{
              padding: '5px 16px', borderRadius: 999,
              background: dir.bg, color: dir.color,
              border: `1.5px solid ${dir.border}`,
              fontWeight: 900, fontSize: 13, letterSpacing: '0.06em',
            }}>
              {dir.label}
            </span>

            <div>
              <span style={{ fontWeight: 900, fontSize: 16, color: 'var(--text-primary)' }}>
                {alert.ticker}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                {alert.name}
              </span>
            </div>

            {hasConflict && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                background: '#f59e0b15', color: '#f59e0b',
                border: '1px solid #f59e0b33', letterSpacing: '0.04em',
              }}>
                ⚡ CONFLICT RESOLVED
              </span>
            )}
          </div>

          {/* Price + time */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-primary)' }}>
              ₹{alert.price?.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {alert.time_str || new Date(alert.timestamp).toLocaleTimeString('en-IN')}
            </div>
          </div>
        </div>

        {/* Row 2: Primary driving pattern */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Primary signal:
          </span>
          <Badge label={alert.pattern}  color={dir.color} />
          <Badge label={alert.category} color={cColor} />
        </div>

        {/* Row 3: Detail line */}
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
          {(alert.details || '').split(' | Signal resolved')[0]}
        </div>

        {/* Row 4: Confidence box */}
        <div style={{
          padding: '10px 12px', borderRadius: 9,
          background: 'rgba(15,23,42,0.4)',
          border: '1px solid rgba(148,163,184,0.08)', marginBottom: 2,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 8,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
              SIGNAL CONFIDENCE
            </span>
            {hasConflict && (
              <ScorePills buyScore={alert.buy_score} sellScore={alert.sell_score} />
            )}
          </div>
          <ConfidenceBar value={alert.confidence ?? 50} color={dir.color} />
        </div>

        {/* Row 5: Collapsible supporting patterns */}
        <SupportingPatterns patterns={alert.all_patterns} />
        <PortfolioImpact alert={alert} portfolio={portfolio} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  SEARCH PANEL
// ══════════════════════════════════════════════════════════════

function StockSearch({ onAdd, watchlistCount, maxCount }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding]   = useState('');

  const search = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await axios.get(`${API}/stocks`, { params: { search: q } });
      setResults(res.data.stocks.slice(0, 8));
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 350);
    return () => clearTimeout(t);
  }, [query, search]);

  const handleAdd = async (stock) => {
    if (watchlistCount >= maxCount) return;
    setAdding(stock.ticker);
    await onAdd(stock);
    setAdding(''); setResults([]); setQuery('');
  };

  const isFull = watchlistCount >= maxCount;

  return (
    <Card>
      <SectionTitle>
        🔍 Search & Add Stocks
        <Badge label={`${watchlistCount} / ${maxCount}`} color={isFull ? '#ef4444' : '#22c55e'} />
      </SectionTitle>

      {isFull && (
        <div style={{
          padding: '10px 14px', borderRadius: 9, marginBottom: 14,
          background: '#ef444418', border: '1px solid #ef444433', color: '#ef4444', fontSize: 13,
        }}>⚠️ Watchlist is full. Remove a stock to add another.</div>
      )}

      <div style={{ position: 'relative' }}>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search by ticker or company name…" disabled={isFull}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '11px 16px', borderRadius: 9,
            background: 'var(--glass-header, rgba(15,23,42,0.6))',
            border: '1px solid var(--glass-border, rgba(148,163,184,0.15))',
            color: 'var(--text-primary, #f1f5f9)', fontSize: 14, outline: 'none',
            opacity: isFull ? 0.5 : 1,
          }}
        />
        {loading && (
          <span style={{
            position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-secondary)', fontSize: 13,
          }}>⏳</span>
        )}
      </div>

      {results.length > 0 && (
        <div style={{
          marginTop: 8, borderRadius: 10,
          border: '1px solid var(--glass-border, rgba(148,163,184,0.15))', overflow: 'hidden',
        }}>
          {results.map((s, i) => (
            <div key={s.ticker} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              borderTop: i > 0 ? '1px solid var(--glass-border, rgba(148,163,184,0.08))' : 'none',
              background: 'var(--glass-header, rgba(15,23,42,0.5))',
            }}>
              <div>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{s.ticker}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 8 }}>{s.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {s.price && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    ₹{s.price.toLocaleString('en-IN')}
                  </span>
                )}
                <button onClick={() => handleAdd(s)} disabled={isFull || adding === s.ticker}
                  style={{
                    padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: isFull ? '#334155' : '#22c55e22',
                    color: isFull ? '#64748b' : '#22c55e', fontWeight: 700, fontSize: 12,
                  }}>{adding === s.ticker ? '…' : '+ Add'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════
//  WATCHLIST PANEL
// ══════════════════════════════════════════════════════════════

function WatchlistPanel({ watchlist, maxCount, onRemove, onScan, scanning }) {
  if (watchlist.length === 0) {
    return (
      <Card>
        <SectionTitle>📋 My Watchlist</SectionTitle>
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
          No stocks added yet. Search above to build your watchlist.
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle right={
        <button onClick={onScan} disabled={scanning} style={{
          padding: '7px 16px', borderRadius: 8, border: 'none',
          background: scanning ? '#334155' : 'var(--tab-active, #818cf8)',
          color: scanning ? '#64748b' : '#fff',
          fontWeight: 700, fontSize: 13, cursor: scanning ? 'not-allowed' : 'pointer',
        }}>
          {scanning ? '⏳ Scanning…' : '▶ Scan Now'}
        </button>
      }>📋 My Watchlist</SectionTitle>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {watchlist.map(s => (
          <div key={s.ticker} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '11px 14px', borderRadius: 10,
            background: 'var(--glass-header, rgba(15,23,42,0.4))',
            border: '1px solid var(--glass-border, rgba(148,163,184,0.1))',
          }}>
            <div>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>{s.ticker}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 8 }}>{s.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {s.price && (
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  ₹{s.price.toLocaleString('en-IN')}
                </span>
              )}
              <IconBtn onClick={() => onRemove(s.ticker)} title="Remove" danger>✕</IconBtn>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>
        Auto-scan every 15 min during market hours (9:15 AM – 3:30 PM IST)
      </div>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════
//  DECISION FEED  — one card per stock
// ══════════════════════════════════════════════════════════════

function DecisionFeed({ alerts, onClear, loading, portfolio }) {
  const [filter, setFilter] = useState('ALL');

  const stockDecisions = groupByStock(alerts);
  const filtered = filter === 'ALL'
    ? stockDecisions
    : stockDecisions.filter(a => a.direction === filter);

  const counts = {
    ALL:     stockDecisions.length,
    BUY:     stockDecisions.filter(a => a.direction === 'BUY').length,
    SELL:    stockDecisions.filter(a => a.direction === 'SELL').length,
    NEUTRAL: stockDecisions.filter(a => a.direction === 'NEUTRAL').length,
  };

  return (
    <Card>
      <SectionTitle right={
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['ALL', 'BUY', 'SELL', 'NEUTRAL'].map(f => {
            const fc = f === 'ALL' ? '#818cf8' : DIR[f]?.color || '#818cf8';
            const active = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: active ? fc + '33' : 'rgba(148,163,184,0.12)',
                color: active ? fc : 'var(--text-secondary)',
                fontWeight: 700, fontSize: 12,
                outline: active ? `1px solid ${fc}55` : 'none',
              }}>
                {f}
                {counts[f] > 0 && (
                  <span style={{
                    marginLeft: 5, borderRadius: 99, padding: '0 5px', fontSize: 10, fontWeight: 900,
                    background: active ? fc + '44' : 'rgba(148,163,184,0.2)',
                    color: active ? fc : 'var(--text-secondary)',
                  }}>{counts[f]}</span>
                )}
              </button>
            );
          })}
          {alerts.length > 0 && (
            <IconBtn onClick={onClear} title="Clear all alerts" danger>🗑</IconBtn>
          )}
        </div>
      }>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          🎯 Stock Decisions
          {stockDecisions.length > 0 && (
            <Badge label={`${stockDecisions.length} stock${stockDecisions.length > 1 ? 's' : ''}`} color='#818cf8' />
          )}
        </div>
      </SectionTitle>

      {/* Info banner */}
      {stockDecisions.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8, marginBottom: 14,
          background: 'rgba(129,140,248,0.06)',
          border: '1px solid rgba(129,140,248,0.15)',
          fontSize: 12, color: 'var(--text-secondary)',
        }}>
          <span>ℹ️</span>
          One final decision per stock — conflicts auto-resolved by signal weight.
          Click <strong style={{ color: 'var(--text-primary)' }}>"N patterns analysed"</strong> to see breakdown.
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
          Loading decisions…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔕</div>
          {alerts.length === 0
            ? 'No signals yet. Add stocks and click "Scan Now" or wait for auto-scan.'
            : `No ${filter} decisions right now.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(alert => (
            <StockDecisionCard key={alert.ticker} alert={alert} portfolio={portfolio} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════
//  CONFIG PANEL
// ══════════════════════════════════════════════════════════════

function ConfigPanel() {
  const [cfg, setCfg]         = useState(null);
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState('');
  const [toast, setToast]     = useState(null);

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    axios.get(`${API}/scanner/config`).then(r => setCfg(r.data)).catch(() => setCfg({}));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...cfg,
        email_recipients: typeof cfg.email_recipients === 'string'
          ? cfg.email_recipients.split(',').map(s => s.trim()).filter(Boolean)
          : cfg.email_recipients,
      };
      await axios.post(`${API}/scanner/config`, payload);
      showToast('✅ Config saved successfully!');
    } catch { showToast('❌ Failed to save config', false); }
    setSaving(false);
  };

  if (!cfg) return <Card><div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading config…</div></Card>;

  const field = (label, key, placeholder, type = 'text') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5, fontWeight: 600 }}>
        {label}
      </label>
      <input type={type} value={cfg[key] || ''} onChange={e => setCfg(p => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder} style={{
          width: '100%', boxSizing: 'border-box', padding: '9px 13px', borderRadius: 8,
          background: 'var(--glass-header, rgba(15,23,42,0.6))',
          border: '1px solid var(--glass-border, rgba(148,163,184,0.15))',
          color: 'var(--text-primary)', fontSize: 13, outline: 'none',
        }} />
    </div>
  );

  return (
    <Card>
      <SectionTitle>⚙️ Notification Settings</SectionTitle>
      {toast && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600,
          background: toast.ok ? '#22c55e18' : '#ef444418',
          border: `1px solid ${toast.ok ? '#22c55e33' : '#ef444433'}`,
          color: toast.ok ? '#22c55e' : '#ef4444',
        }}>{toast.msg}</div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', marginBottom: 12 }}>📬 Telegram</div>
        {field('Bot Token', 'telegram_token', 'From @BotFather')}
        {field('Chat ID', 'telegram_chat_id', 'Your chat or group ID')}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>
          1. Message @BotFather → /newbot → copy token<br />
          2. Message @userinfobot → copy your chat ID
        </div>
        <button onClick={async () => {
          setTesting('telegram');
          try {
            const res = await axios.post(`${API}/scanner/test-telegram`);
            showToast(res.data.success ? '✅ Telegram test sent!' : '❌ ' + res.data.message, res.data.success);
          } catch { showToast('❌ Test failed', false); }
          setTesting('');
        }} disabled={testing === 'telegram'} style={{
          padding: '7px 16px', borderRadius: 7, border: '1px solid #818cf833',
          background: '#818cf811', color: '#818cf8', fontWeight: 700, fontSize: 12, cursor: 'pointer',
        }}>{testing === 'telegram' ? '⏳ Sending…' : '📨 Send Test Message'}</button>
      </div>

      <div style={{ borderTop: '1px solid var(--glass-border)', marginBottom: 20 }} />

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#22d3ee' }}>📧 Email</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.email_enabled || false}
              onChange={e => setCfg(p => ({ ...p, email_enabled: e.target.checked }))}
              style={{ accentColor: '#22c55e' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Enable email alerts</span>
          </label>
        </div>
        <div style={{ opacity: cfg.email_enabled ? 1 : 0.4, pointerEvents: cfg.email_enabled ? 'auto' : 'none' }}>
          {field('Gmail Sender', 'email_sender', 'your@gmail.com')}
          {field('App Password', 'email_password', '16-char Gmail App Password', 'password')}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5, fontWeight: 600 }}>
              Recipients (comma-separated)
            </label>
            <input
              value={Array.isArray(cfg.email_recipients) ? cfg.email_recipients.join(', ') : (cfg.email_recipients || '')}
              onChange={e => setCfg(p => ({ ...p, email_recipients: e.target.value }))}
              placeholder="user1@gmail.com, user2@gmail.com"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '9px 13px', borderRadius: 8,
                background: 'var(--glass-header, rgba(15,23,42,0.6))',
                border: '1px solid var(--glass-border, rgba(148,163,184,0.15))',
                color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>
            Use a Gmail App Password — not your Google login password.<br />
            Generate at: Google Account → Security → 2FA → App Passwords
          </div>
          <button onClick={async () => {
            setTesting('email');
            try {
              const res = await axios.post(`${API}/scanner/test-email`);
              showToast(res.data.success ? '✅ Email test sent!' : '❌ ' + res.data.message, res.data.success);
            } catch { showToast('❌ Test failed', false); }
            setTesting('');
          }} disabled={testing === 'email'} style={{
            padding: '7px 16px', borderRadius: 7, border: '1px solid #22d3ee33',
            background: '#22d3ee11', color: '#22d3ee', fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}>{testing === 'email' ? '⏳ Sending…' : '📨 Send Test Email'}</button>
        </div>
      </div>

      <button onClick={save} disabled={saving} style={{
        width: '100%', padding: '11px', borderRadius: 9, border: 'none',
        background: saving ? '#334155' : 'var(--tab-active, #818cf8)',
        color: saving ? '#64748b' : '#fff', fontWeight: 700, fontSize: 14,
        cursor: saving ? 'not-allowed' : 'pointer',
      }}>{saving ? '⏳ Saving…' : '💾 Save Settings'}</button>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════

export default function WatchlistScanner() {
  const [watchlist,  setWatchlist]  = useState([]);
  const [alerts,     setAlerts]     = useState([]);
  const [maxCount,   setMaxCount]   = useState(10);
  const [scanning,   setScanning]   = useState(false);
  const [alertsLoad, setAlertsLoad] = useState(true);
  const [portfolio,  setPortfolio]  = useState(null);
  const [activeTab,  setActiveTab]  = useState('scanner');
  const [toast,      setToast]      = useState(null);
  const hasLoadedAlertsRef          = useRef(false);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 3500);
  };

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/watchlist`);
      setWatchlist(res.data.watchlist);
      setMaxCount(res.data.max);
    } catch {}
  }, []);

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/portfolio`);
      setPortfolio(res.data);
    } catch {}
  }, []);

  const fetchAlerts = useCallback(async () => {
    if (!hasLoadedAlertsRef.current) {
      setAlertsLoad(true);
    }
    try {
      const res = await axios.get(`${API}/scanner/alerts`);
      setAlerts(res.data.alerts);
    } catch {}
    setAlertsLoad(false);
    hasLoadedAlertsRef.current = true;
  }, []);

  useEffect(() => {
    fetchWatchlist();
    fetchAlerts();
    fetchPortfolio();
    const t = setInterval(() => { fetchAlerts(); fetchPortfolio(); }, 60000);
    return () => clearInterval(t);
  }, [fetchWatchlist, fetchAlerts, fetchPortfolio]);

  const handleAdd = async (stock) => {
    try {
      await axios.post(`${API}/watchlist`, { ticker: stock.ticker, name: stock.name });
      await fetchWatchlist();
      showToast(`✅ ${stock.ticker} added to watchlist`);
    } catch (e) {
      showToast(`❌ ${e.response?.data?.detail || 'Failed to add'}`, false);
    }
  };

  const handleRemove = async (ticker) => {
    try {
      await axios.delete(`${API}/watchlist/${ticker}`);
      await fetchWatchlist();
      showToast(`🗑 ${ticker} removed`);
    } catch { showToast('❌ Failed to remove', false); }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await axios.post(`${API}/scanner/run`);
      showToast(`🔍 ${res.data.message}`);
      await fetchAlerts();
    } catch { showToast('❌ Scan failed', false); }
    setScanning(false);
  };

  const handleClearAlerts = async () => {
    try {
      await axios.delete(`${API}/scanner/alerts`);
      setAlerts([]);
      showToast('🗑 Alerts cleared');
    } catch {}
  };

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* Header */}
      <div style={{
        padding: '28px 40px 0',
        background: 'var(--glass-header, rgba(15,23,42,0.7))',
        borderBottom: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
              📡 Pattern Scanner
            </h2>
            <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              15-minute NSE/BSE patterns · One final decision per stock · Up to 10 stocks
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#22c55e',
              boxShadow: '0 0 6px #22c55e', display: 'inline-block', animation: 'pulse 2s infinite',
            }} />
            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>Auto-scan ON</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'scanner', label: '🎯 Watchlist & Decisions' },
            { key: 'config',  label: '⚙️ Notifications' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '12px 20px', border: 'none', cursor: 'pointer',
              background: 'transparent', fontSize: 14, fontWeight: 600,
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: `3px solid ${activeTab === tab.key ? 'var(--tab-active, #818cf8)' : 'transparent'}`,
              transition: 'all 0.2s',
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 70, right: 28, zIndex: 9999,
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: toast.ok ? '#22c55e18' : '#ef444418',
          border: `1px solid ${toast.ok ? '#22c55e55' : '#ef444455'}`,
          color: toast.ok ? '#22c55e' : '#ef4444',
          backdropFilter: 'blur(12px)', boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          animation: 'slideIn 0.2s ease',
        }}>{toast.msg}</div>
      )}

      {/* Content */}
      <div style={{ padding: '28px 40px', maxWidth: 1300, margin: '0 auto' }}>
        {activeTab === 'scanner' && (
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <StockSearch onAdd={handleAdd} watchlistCount={watchlist.length} maxCount={maxCount} />
              <WatchlistPanel
                watchlist={watchlist} maxCount={maxCount}
                onRemove={handleRemove} onScan={handleScan} scanning={scanning}
              />
            </div>
            <DecisionFeed alerts={alerts} onClear={handleClearAlerts} loading={alertsLoad} portfolio={portfolio} />
          </div>
        )}
        {activeTab === 'config' && (
          <div style={{ maxWidth: 560 }}><ConfigPanel /></div>
        )}
      </div>

      <style>{`
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}