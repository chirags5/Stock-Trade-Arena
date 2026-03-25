import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

export default function SignalFeed({ API, prices, onTrade }) {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [quantities, setQty] = useState({});
  const [toast, setToast] = useState(null);
  const [acting, setActing] = useState({});
  const [mode, setMode] = useState('nifty500');
  const [totalCount, setTotalCount] = useState(0);
  const [slTpOpen, setSlTpOpen] = useState({});
  const [slTpValues, setSlTpValues] = useState({});

  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const hoverFetchRef = useRef({});

  const fetchStocks = useCallback(async (query) => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/stocks`, { params: query ? { search: query } : {} });
      const stockList = res.data.stocks || [];
      setStocks(stockList);
      setSuggestions(res.data.suggestions || []);
      setMode(res.data.mode || 'nifty500');
      setTotalCount(res.data.total || 0);

      if (query && query.length >= 2) {
        stockList.forEach(stock => {
          if (!stock.price) {
            axios.get(`${API}/price/${stock.ticker}`).then(r => {
              if (r.data?.price) {
                setStocks(prev => prev.map(s => s.ticker === stock.ticker ? { ...s, price: r.data.price } : s));
              }
            }).catch(() => {});
          }
        });
      }
    } catch (e) {
      console.error('Stocks fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [API]);

  useEffect(() => { fetchStocks(''); }, [fetchStocks]);

  useEffect(() => {
    if (Object.keys(prices).length > 0) {
      setStocks(prev => prev.map(s => ({ ...s, price: prices[s.ticker] !== undefined ? prices[s.ticker] : s.price })));
    }
  }, [prices]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/prices`);
        const newPrices = res.data.prices || {};
        setStocks(prev => prev.map(s => ({ ...s, price: newPrices[s.ticker] !== undefined ? newPrices[s.ticker] : s.price })));
      } catch (e) {}
    }, 10000);
    return () => clearInterval(interval);
  }, [API]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (search.trim().length === 0) { fetchStocks(''); setSuggestions([]); return; }
    if (search.trim().length < 2) return;
    debounceRef.current = setTimeout(() => { fetchStocks(search.trim()); }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [search, fetchStocks]);

  function getQty(ticker) { return quantities[ticker] || 1; }
  function showToast(msg, isError = false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleTrade(stock, direction) {
    const qty = getQty(stock.ticker);
    const sltp = slTpValues[stock.ticker] || {};
    const sl = sltp.sl ? parseFloat(sltp.sl) : null;
    const tp = sltp.tp ? parseFloat(sltp.tp) : null;
    let price = prices[stock.ticker] ?? stock.price;
    const key = `${stock.ticker}-${direction}`;

    if (!price) {
      try {
        const res = await axios.get(`${API}/price/${stock.ticker}`);
        price = res.data?.price;
        if (price) setStocks(prev => prev.map(s => s.ticker === stock.ticker ? { ...s, price } : s));
      } catch (e) {
        return showToast(`Could not fetch price for ${stock.ticker}`, true);
      }
    }

    if (!price) return showToast(`No live price for ${stock.ticker}. Market may be closed.`, true);

    setActing(prev => ({ ...prev, [key]: true }));
    try {
      await axios.post(`${API}/trade`, {
        ticker: stock.ticker,
        direction,
        qty,
        buy_price: price,
        stop_loss: sl || null,
        take_profit: tp || null,
      });
      const cost = (qty * price).toLocaleString('en-IN', { maximumFractionDigits: 0 });
      showToast(`✅ ${direction} ${qty} × ${stock.ticker} @ ₹${price.toLocaleString('en-IN')}  |  ₹${cost} deducted`);
      onTrade();
    } catch (e) {
      showToast(e.response?.data?.detail || 'Trade failed. Try again.', true);
    } finally {
      setActing(prev => ({ ...prev, [key]: false }));
    }
  }

  async function fetchPriceOnHover(stock) {
    const ticker = stock.ticker;
    if (prices[ticker] || stock.price || hoverFetchRef.current[ticker]) return;
    hoverFetchRef.current[ticker] = true;
    try {
      const res = await axios.get(`${API}/price/${ticker}`);
      const price = res.data?.price;
      if (price) setStocks(prev => prev.map(s => s.ticker === ticker ? { ...s, price } : s));
    } catch (e) {
    } finally {
      hoverFetchRef.current[ticker] = false;
    }
  }

  function handleSuggestionClick(ticker) { setSearch(ticker); setSuggestions([]); }
  function clearSearch() { setSearch(''); setSuggestions([]); fetchStocks(''); searchRef.current?.focus(); }

  return (
    <div style={s.wrapper}>
      <div style={s.topControls}>
        <div style={s.titleArea}>
          <h2 style={s.sectionTitle}>{mode === 'nifty500' ? 'Market Overview' : 'Search Results'}</h2>
          <span style={s.badge}>{totalCount} {mode === 'nifty500' ? 'Constituents' : 'Results'}</span>
        </div>
        <div style={s.searchWrap}>
          <div style={s.searchBox}>
            <span style={s.searchIcon}>🔍</span>
            <input ref={searchRef} type="text" placeholder="Search for a stock..." value={search}
              onChange={e => setSearch(e.target.value)} style={s.searchInput} autoComplete="off" spellCheck="false" />
            {search && <button onClick={clearSearch} style={s.clearBtn}>✕</button>}
          </div>
          {suggestions.length > 0 && (
            <div style={s.suggestionBox}>
              {suggestions.map(sug => (
                <div key={sug.ticker} style={s.suggestionItem} onClick={() => handleSuggestionClick(sug.ticker)}>
                  <span>💡 Did you mean <strong>{sug.ticker}</strong> — {sug.name}?</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ ...s.toast, background: toast.isError ? 'var(--red-bg)' : 'var(--green-bg)', borderColor: toast.isError ? 'var(--red-border)' : 'var(--green-border)', color: toast.isError ? 'var(--red-text)' : 'var(--green-text)' }}>
          {toast.msg}
        </div>
      )}

      <div style={s.glassPanel}>
        {loading ? (
          <div style={s.loadingWrap}>
            <div style={s.loadingSpinner} />
            <div style={s.loadingText}>Connecting to market data...</div>
          </div>
        ) : (
          <div style={s.tableContainer}>
            <div style={s.tableHead}>
              <div style={s.cTicker}>Ticker</div>
              <div style={s.cName}>Company</div>
              <div style={s.cPrice}>Live Price</div>
              <div style={s.cQty}>Qty</div>
              <div style={s.cActions}>Actions</div>
            </div>
            <div style={s.tableBody}>
              {stocks.length === 0 ? (
                <div style={s.emptyState}>No stocks matched your search.</div>
              ) : (
                stocks.map(stock => {
                  const livePrice = prices[stock.ticker] ?? stock.price;
                  const qty = getQty(stock.ticker);
                  const cost = livePrice ? qty * livePrice : null;
                  const buyKey = `${stock.ticker}-BUY`;
                  const shortKey = `${stock.ticker}-SHORT`;

                  return (
                    <React.Fragment key={stock.ticker}>
                      <div style={s.row} onMouseEnter={() => fetchPriceOnHover(stock)}>
                        <div style={s.cTicker}>
                          <div style={s.tickerIcon}>{stock.ticker.charAt(0)}</div>
                          <span style={s.tickerText}>{stock.ticker}</span>
                        </div>
                        <div style={s.cName}>
                          <span style={s.nameText} title={stock.name}>{stock.name}</span>
                        </div>
                        <div style={s.cPrice}>
                          {livePrice
                            ? <span style={s.priceText}>₹{livePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            : <span style={s.noPrice}>—</span>}
                        </div>
                        <div style={s.cQty}>
                          <input type="number" min="1" value={qty}
                            onChange={e => setQty(prev => ({ ...prev, [stock.ticker]: Math.max(1, parseInt(e.target.value) || 1) }))}
                            style={s.qtyInput} />
                        </div>
                        <div style={s.cActions}>
                          {cost && <span style={s.costText}>₹{cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                          <button onClick={() => handleTrade(stock, 'BUY')} disabled={acting[buyKey]}
                            style={{ ...s.actionBtn, ...s.buyBtn, opacity: acting[buyKey] ? 0.6 : 1 }}>
                            {acting[buyKey] ? '...' : 'Buy'}
                          </button>
                          <button onClick={() => handleTrade(stock, 'SHORT')} disabled={acting[shortKey]}
                            style={{ ...s.actionBtn, ...s.shortBtn, opacity: acting[shortKey] ? 0.6 : 1 }}>
                            {acting[shortKey] ? '...' : 'Short'}
                          </button>
                          <button
                            onClick={() => setSlTpOpen(prev => ({ ...prev, [stock.ticker]: !prev[stock.ticker] }))}
                            style={{
                              ...s.actionBtn,
                              backgroundColor: slTpOpen[stock.ticker] ? 'var(--tab-shadow)' : 'var(--table-header-bg)',
                              border: `1px solid ${slTpOpen[stock.ticker] ? 'var(--tab-active)' : 'var(--glass-border)'}`,
                              color: slTpOpen[stock.ticker] ? 'var(--tab-active)' : 'var(--text-secondary)',
                            }}
                          >
                            🛡 SL/TP
                          </button>
                        </div>
                      </div>

                      {slTpOpen[stock.ticker] && (
                        <div style={s.slTpPanel}>
                          <div style={s.slTpField}>
                            <label style={s.slTpLabel}>🔴 Stop Loss ₹</label>
                            <input
                              type="number"
                              placeholder={livePrice ? `e.g. ${(livePrice * 0.95).toFixed(0)}` : 'Price'}
                              value={slTpValues[stock.ticker]?.sl || ''}
                              onChange={e => setSlTpValues(prev => ({
                                ...prev,
                                [stock.ticker]: { ...prev[stock.ticker], sl: e.target.value },
                              }))}
                              style={s.slTpInput}
                            />
                            <span style={s.slTpHint}>Auto-exit if price hits this loss level</span>
                          </div>
                          <div style={s.slTpField}>
                            <label style={s.slTpLabel}>🟢 Take Profit ₹</label>
                            <input
                              type="number"
                              placeholder={livePrice ? `e.g. ${(livePrice * 1.05).toFixed(0)}` : 'Price'}
                              value={slTpValues[stock.ticker]?.tp || ''}
                              onChange={e => setSlTpValues(prev => ({
                                ...prev,
                                [stock.ticker]: { ...prev[stock.ticker], tp: e.target.value },
                              }))}
                              style={s.slTpInput}
                            />
                            <span style={s.slTpHint}>Auto-exit when target profit is reached</span>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  wrapper: { width: '100%' },
  topControls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '20px' },
  titleArea: { display: 'flex', alignItems: 'center', gap: '12px' },
  sectionTitle: { fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 },
  badge: { fontSize: '11px', backgroundColor: 'var(--table-header-bg)', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--glass-border)' },
  searchWrap: { position: 'relative', width: '300px' },
  searchBox: { display: 'flex', alignItems: 'center', backgroundColor: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: '24px', padding: '2px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05) inset', backdropFilter: 'blur(10px)' },
  searchIcon: { fontSize: '14px', color: 'var(--text-secondary)' },
  searchInput: { flex: 1, padding: '8px 8px', border: 'none', outline: 'none', fontSize: '14px', color: 'var(--text-primary)', backgroundColor: 'transparent', fontFamily: 'inherit' },
  clearBtn: { padding: '4px', border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' },
  suggestionBox: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'var(--glass-solid)', backdropFilter: 'blur(16px)', border: '1px solid var(--glass-border)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 100, marginTop: '8px', padding: '6px' },
  suggestionItem: { padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', borderRadius: '8px' },
  toast: { border: '1px solid', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', backdropFilter: 'blur(10px)' },
  glassPanel: { backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', borderRadius: '12px', boxShadow: 'var(--glass-shadow)', overflow: 'hidden', transition: 'all 0.3s ease' },
  tableContainer: { width: '100%' },
  tableHead: { display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: 'var(--table-header-bg)' },
  tableBody: { maxHeight: '65vh', overflowY: 'auto' },
  row: { display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', transition: 'background 0.2s ease' },
  cTicker: { width: '180px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' },
  cName: { flex: 1, minWidth: 0, paddingRight: '20px' },
  cPrice: { width: '120px', flexShrink: 0, textAlign: 'right' },
  cQty: { width: '100px', flexShrink: 0, textAlign: 'center', padding: '0 10px' },
  cActions: { width: '360px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' },
  tickerIcon: { width: '28px', height: '28px', backgroundColor: 'var(--glass-border)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)' },
  tickerText: { fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' },
  nameText: { fontSize: '14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' },
  priceText: { fontSize: '15px', fontWeight: '500', color: 'var(--text-primary)' },
  noPrice: { fontSize: '15px', color: 'var(--text-secondary)' },
  qtyInput: { width: '60px', padding: '8px', border: '1px solid var(--glass-border)', borderRadius: '6px', fontSize: '14px', textAlign: 'center', outline: 'none', backgroundColor: 'var(--table-header-bg)', color: 'var(--text-primary)', transition: 'border-color 0.2s' },
  costText: { fontSize: '12px', color: 'var(--text-secondary)', minWidth: '70px', textAlign: 'right' },
  actionBtn: { padding: '8px 14px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s', cursor: 'pointer' },
  buyBtn: { backgroundColor: '#4caf50', color: '#ffffff' },
  shortBtn: { backgroundColor: '#ef5350', color: '#ffffff' },
  slTpPanel: {
    display: 'flex',
    gap: '24px',
    padding: '12px 20px 16px 72px',
    backgroundColor: 'var(--table-header-bg)',
    borderBottom: '1px solid var(--glass-border)',
    flexWrap: 'wrap',
  },
  slTpField: { display: 'flex', alignItems: 'center', gap: '10px' },
  slTpLabel: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', whiteSpace: 'nowrap' },
  slTpInput: {
    width: '110px',
    padding: '6px 10px',
    border: '1px solid var(--glass-border)',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
    backgroundColor: 'var(--input-bg)',
    color: 'var(--text-primary)',
  },
  slTpHint: { fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' },
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', gap: '16px' },
  loadingSpinner: { width: '32px', height: '32px', border: '3px solid var(--glass-border)', borderTop: '3px solid var(--tab-active)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText: { fontSize: '14px', color: 'var(--text-secondary)' },
  emptyState: { textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)', fontSize: '15px' },
};
