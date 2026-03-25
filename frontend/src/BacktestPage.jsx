import React, { useState, useRef } from 'react';
import axios from 'axios';

const PATTERNS = ["Bullish Flag Breakout", "Support Bounce", "Bearish Breakdown"];

function EquityCurve({ data, width = 600, height = 100 }) {
  if (!data || data.length < 2) return null;
  const values  = data.map(d => d.value);
  const min     = Math.min(...values);
  const max     = Math.max(...values);
  const range   = max - min || 1;
  const pts     = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 10) - 5;
    return `${x},${y}`;
  }).join(' ');
  const isProfit = values[values.length - 1] >= values[0];
  const color    = isProfit ? '#4caf50' : '#ef5350';
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="btgrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color} strokeWidth="2.5" points={pts} />
    </svg>
  );
}

export default function BacktestPage({ API }) {
  const [search,      setSearch]      = useState('');
  const [ticker,      setTicker]      = useState(null);
  const [pattern,     setPattern]     = useState(PATTERNS[0]);
  const [result,      setResult]      = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [recentList,  setRecentList]  = useState([]);
  const inputRef = useRef(null);

  async function runBacktest(t, p) {
    const useTicker  = t || ticker;
    const usePattern = p || pattern;
    if (!useTicker) return;

    setLoading(true); setError(null); setResult(null);
    try {
      const res = await axios.get(`${API}/backtest/${useTicker}`, { params: { pattern: usePattern } });
      setResult(res.data);
      setRecentList(prev => {
        const filtered = prev.filter(x => x !== useTicker);
        return [useTicker, ...filtered].slice(0, 6);
      });
    } catch (e) {
      setError(e.response?.data?.detail || 'Not enough historical data for this stock.');
    } finally { setLoading(false); }
  }

  function handleSearch(e) {
    e.preventDefault();
    const val = search.trim().toUpperCase();
    if (!val) return;
    setTicker(val);
    runBacktest(val, pattern);
  }

  function handlePatternChange(pat) {
    setPattern(pat);
    if (ticker) runBacktest(ticker, pat);
  }

  return (
    <div style={p.wrapper}>
      <div style={p.pageHeader}>
        <div>
          <h1 style={p.pageTitle}>📊 Backtest Engine</h1>
          <div style={p.pageSub}>
            Test any Nifty 500 stock against 3 proven patterns using 2 years of real historical data
          </div>
        </div>
      </div>

      <div style={p.body}>
        <div style={p.leftPanel}>
          <div style={p.card}>
            <div style={p.cardTitle}>Search Stock</div>
            <form onSubmit={handleSearch} style={p.searchForm}>
              <input
                ref={inputRef}
                type="text"
                placeholder="Enter ticker e.g. RELIANCE"
                value={search}
                onChange={e => setSearch(e.target.value.toUpperCase())}
                style={p.searchInput}
                autoComplete="off"
                spellCheck="false"
              />
              <button type="submit" style={p.searchBtn}>Run →</button>
            </form>
            <div style={p.hint}>Enter NSE ticker symbol and press Run</div>
          </div>

          <div style={p.card}>
            <div style={p.cardTitle}>Strategy</div>
            <div style={p.patternList}>
              {PATTERNS.map(pat => (
                <div key={pat}
                  onClick={() => handlePatternChange(pat)}
                  style={{ ...p.patternBtn, ...(pattern === pat ? p.patternActive : {}) }}>
                  <div style={p.patternName}>{pat}</div>
                  <div style={p.patternDesc}>{PATTERN_DESC[pat]}</div>
                </div>
              ))}
            </div>
          </div>

          {recentList.length > 0 && (
            <div style={p.card}>
              <div style={p.cardTitle}>Recent</div>
              <div style={p.recentList}>
                {recentList.map(t => (
                  <div key={t} style={p.recentChip}
                    onClick={() => { setSearch(t); setTicker(t); runBacktest(t, pattern); }}>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={p.rightPanel}>
          {!ticker && !loading && (
            <div style={p.emptyState}>
              <div style={p.emptyIcon}>📈</div>
              <div style={p.emptyTitle}>Enter a stock ticker to begin</div>
              <div style={p.emptySub}>Try RELIANCE, TCS, HDFCBANK, INFY, BHARTIARTL</div>
              <div style={p.quickTickers}>
                {['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK'].map(t => (
                  <div key={t} style={p.quickBtn}
                    onClick={() => { setSearch(t); setTicker(t); runBacktest(t, pattern); }}>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div style={p.loadingState}>
              <div style={p.spinner} />
              <div style={p.loadText}>Running backtest on {ticker}...</div>
              <div style={p.loadSub}>Fetching 2 years of historical data from NSE</div>
            </div>
          )}

          {error && !loading && (
            <div style={p.errorBox}>
              <div style={{ fontSize: '24px', marginBottom: '12px' }}>⚠️</div>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>{error}</div>
              <div style={{ fontSize: '13px', opacity: 0.8 }}>Try a different ticker or pattern</div>
            </div>
          )}

          {result && !loading && (
            <>
              <div style={p.resultHeader}>
                <div>
                  <div style={p.resultTitle}>{result.ticker}</div>
                  <div style={p.resultSub}>{result.pattern} · 2-year backtest · 10% capital per trade</div>
                </div>
                <div style={{
                  ...p.returnBadge,
                  backgroundColor: result.total_return_pct >= 0 ? 'var(--green-bg)' : 'var(--red-bg)',
                  border: `1px solid ${result.total_return_pct >= 0 ? 'var(--green-border)' : 'var(--red-border)'}`,
                  color: result.total_return_pct >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                }}>
                  {result.total_return_pct >= 0 ? '+' : ''}{result.total_return_pct}% Total Return
                </div>
              </div>

              <div style={p.statsGrid}>
                {[
                  { label: 'Total Return',  val: `${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct}%`,  good: result.total_return_pct >= 0 },
                  { label: 'Win Rate',      val: `${result.win_rate}%`,          good: result.win_rate >= 50 },
                  { label: 'Total Trades',  val: result.total_trades,            good: true, neutral: true },
                  { label: 'Max Drawdown',  val: `-${result.max_drawdown_pct}%`,  good: false },
                  { label: 'Final Capital', val: `₹${result.final_capital.toLocaleString('en-IN')}`, good: result.final_capital >= 100000, neutral: false },
                  { label: 'Avg P&L/Trade', val: `₹${result.avg_pnl?.toLocaleString('en-IN') || 0}`, good: result.avg_pnl >= 0 },
                ].map(stat => (
                  <div key={stat.label} style={{
                    ...p.statCard,
                    ...(stat.neutral ? p.cardNeutral : stat.good ? p.cardGreen : p.cardRed)
                  }}>
                    <div style={p.statLabel}>{stat.label}</div>
                    <div style={{
                      ...p.statVal,
                      color: stat.neutral ? 'var(--text-primary)' : stat.good ? 'var(--green-text)' : 'var(--red-text)'
                    }}>{stat.val}</div>
                  </div>
                ))}
              </div>

              {result.equity_curve?.length > 1 && (
                <div style={p.curveCard}>
                  <div style={p.curveTitle}>EQUITY CURVE</div>
                  <EquityCurve data={result.equity_curve} height={120} />
                  <div style={p.curveFooter}>
                    <span style={{ color: 'var(--text-secondary)' }}>Start: ₹1,00,000</span>
                    <span style={{ color: result.final_capital >= 100000 ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 600 }}>
                      End: ₹{result.final_capital.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )}

              {result.trades?.length > 0 ? (
                <div style={p.tableCard}>
                  <div style={p.tableTitle}>RECENT SIMULATED TRADES (LAST 20)</div>
                  <div style={p.tableScroll}>
                    <table style={p.table}>
                      <thead>
                        <tr>
                          {['Date','Entry Price','Exit Price','Qty','P&L','Return'].map(h => (
                            <th key={h} style={p.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.map((t, i) => (
                          <tr key={i} style={p.tr}>
                            <td style={p.td}>{t.date}</td>
                            <td style={p.td}>₹{t.entry.toLocaleString('en-IN')}</td>
                            <td style={p.td}>₹{t.exit.toLocaleString('en-IN')}</td>
                            <td style={p.td}>{t.qty}</td>
                            <td style={{ ...p.td, color: t.pnl >= 0 ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 600 }}>
                              {t.pnl >= 0 ? '+' : ''}₹{Math.abs(t.pnl).toLocaleString('en-IN')}
                            </td>
                            <td style={{ ...p.td, color: t.return_pct >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
                              {t.return_pct >= 0 ? '+' : ''}{t.return_pct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={p.noTrades}>
                  This pattern never triggered on {result.ticker} in the 2-year window.
                  Try a different pattern or stock.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const PATTERN_DESC = {
  "Bullish Flag Breakout": "Price breaks above 20-day high with high volume",
  "Support Bounce":        "Price bounces from 20-day support level",
  "Bearish Breakdown":     "Price breaks below 20-day low with high volume",
};

const p = {
  wrapper: { minHeight: '100vh' },
  pageHeader: { padding: '32px 40px 24px', borderBottom: '1px solid var(--glass-border)', backgroundColor: 'var(--glass-header)', backdropFilter: 'blur(20px)' },
  pageTitle:  { fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 8px 0' },
  pageSub:    { fontSize: '14px', color: 'var(--text-secondary)' },

  body: { display: 'flex', gap: '24px', padding: '28px 40px', maxWidth: '1400px', margin: '0 auto', width: '100%', boxSizing: 'border-box' },

  leftPanel:  { width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' },
  rightPanel: { flex: 1, minWidth: 0 },

  card: { backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', backdropFilter: 'blur(16px)', boxShadow: 'var(--glass-shadow)' },
  cardTitle: { fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' },

  searchForm:  { display: 'flex', gap: '8px', marginBottom: '8px' },
  searchInput: { flex: 1, padding: '10px 14px', border: '1px solid var(--glass-border)', borderRadius: '8px', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', outline: 'none', fontFamily: 'inherit' },
  searchBtn:   { padding: '10px 16px', backgroundColor: 'var(--tab-active)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  hint:        { fontSize: '11px', color: 'var(--text-secondary)' },

  patternList:   { display: 'flex', flexDirection: 'column', gap: '8px' },
  patternBtn:    { padding: '12px 14px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'var(--table-header-bg)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' },
  patternActive: { backgroundColor: 'var(--tab-shadow)', border: '1px solid var(--tab-active)' },
  patternName:   { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '3px' },
  patternDesc:   { fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 },

  recentList: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  recentChip: { padding: '5px 12px', border: '1px solid var(--glass-border)', borderRadius: '20px', background: 'var(--table-header-bg)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },

  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center' },
  emptyIcon:  { fontSize: '48px', marginBottom: '16px', opacity: 0.5 },
  emptyTitle: { fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' },
  emptySub:   { fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' },
  quickTickers: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' },
  quickBtn:   { padding: '8px 16px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'var(--glass-bg)', color: 'var(--tab-active)', fontSize: '13px', fontWeight: '600', cursor: 'pointer', backdropFilter: 'blur(8px)' },

  loadingState: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', gap: '12px' },
  spinner:  { width: '32px', height: '32px', border: '3px solid var(--glass-border)', borderTop: '3px solid var(--tab-active)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadText: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' },
  loadSub:  { fontSize: '13px', color: 'var(--text-secondary)' },

  errorBox: { backgroundColor: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red-text)', padding: '32px', borderRadius: '12px', textAlign: 'center' },

  resultHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' },
  resultTitle:  { fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' },
  resultSub:    { fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' },
  returnBadge:  { padding: '8px 16px', borderRadius: '8px', fontSize: '15px', fontWeight: '700', backdropFilter: 'blur(8px)' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' },
  statCard:  { padding: '16px', borderRadius: '10px', backdropFilter: 'blur(10px)' },
  cardNeutral: { backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)' },
  cardGreen:   { backgroundColor: 'var(--green-bg)', border: '1px solid var(--green-border)' },
  cardRed:     { backgroundColor: 'var(--red-bg)',   border: '1px solid var(--red-border)' },
  statLabel: { fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' },
  statVal:   { fontSize: '22px', fontWeight: '700' },

  curveCard:   { backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', marginBottom: '20px' },
  curveTitle:  { fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '12px' },
  curveFooter: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '10px' },

  tableCard:   { backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', overflow: 'hidden' },
  tableTitle:  { padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', backgroundColor: 'var(--table-header-bg)', borderBottom: '1px solid var(--glass-border)', letterSpacing: '0.08em' },
  tableScroll: { overflowX: 'auto' },
  table:  { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th:     { padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: 'var(--table-header-bg)', borderBottom: '1px solid var(--glass-border)' },
  tr:     { borderBottom: '1px solid var(--glass-border)' },
  td:     { padding: '12px 16px', color: 'var(--text-primary)' },
  noTrades: { padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px', backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px' },
};