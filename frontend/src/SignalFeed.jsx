import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

export default function SignalFeed({ API, prices, onTrade }) {
  const [stocks,      setStocks]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [quantities,  setQty]         = useState({});
  const [toast,       setToast]       = useState(null);
  const [acting,      setActing]      = useState({});
  const [mode,        setMode]        = useState('nifty500');
  const [totalCount,  setTotalCount]  = useState(0);

  const searchRef    = useRef(null);
  const debounceRef  = useRef(null);
  const hoverFetchRef = useRef({});

  // ── Initial load — Nifty 500 ───────────────────────────────────────────────
  useEffect(() => {
    fetchStocks('');
  }, []);

  // ── Sync live prices into stock list ──────────────────────────────────────
  useEffect(() => {
    if (Object.keys(prices).length > 0) {
      setStocks(prev => prev.map(s => ({
        ...s,
        price: prices[s.ticker] !== undefined ? prices[s.ticker] : s.price,
      })));
    }
  }, [prices]);

  // Auto-poll backend prices to fill missing values progressively.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/prices`);
        const newPrices = res.data.prices || {};
        setStocks(prev => prev.map(s => ({
          ...s,
          price: newPrices[s.ticker] !== undefined
            ? newPrices[s.ticker]
            : s.price,
        })));
      } catch (e) {
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [API]);

  // ── Debounced search ───────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (search.trim().length === 0) {
      fetchStocks('');
      setSuggestions([]);
      return;
    }
    if (search.trim().length < 2) return;
    debounceRef.current = setTimeout(() => {
      fetchStocks(search.trim());
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  async function fetchStocks(query) {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/stocks`, {
        params: query ? { search: query } : {},
      });
      const stockList = res.data.stocks || [];
      setStocks(stockList);
      setSuggestions(res.data.suggestions || []);
      setMode(res.data.mode            || 'nifty500');
      setTotalCount(res.data.total     || 0);

      // For search results, eagerly fetch any missing prices so rows fill quickly.
      if (query && query.length >= 2) {
        stockList.forEach(stock => {
          if (!stock.price) {
            axios.get(`${API}/price/${stock.ticker}`)
              .then(r => {
                if (r.data?.price) {
                  setStocks(prev => prev.map(s =>
                    s.ticker === stock.ticker
                      ? { ...s, price: r.data.price }
                      : s
                  ));
                }
              })
              .catch(() => {});
          }
        });
      }
    } catch (e) {
      console.error('Stocks fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  function getQty(ticker) {
    return quantities[ticker] || 1;
  }

  function showToast(msg, isError = false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleTrade(stock, direction) {
    const qty   = getQty(stock.ticker);
    let price   = prices[stock.ticker] ?? stock.price;
    const key   = `${stock.ticker}-${direction}`;

    if (!price) {
      try {
        const res = await axios.get(`${API}/price/${stock.ticker}`);
        price = res.data?.price;
        if (price) {
          setStocks(prev => prev.map(s =>
            s.ticker === stock.ticker ? { ...s, price } : s
          ));
        }
      } catch (e) {
        showToast(`Could not fetch price for ${stock.ticker}`, true);
        return;
      }
    }

    if (!price) {
      showToast(`No live price for ${stock.ticker}. Market may be closed.`, true);
      return;
    }

    setActing(prev => ({ ...prev, [key]: true }));
    try {
      await axios.post(`${API}/trade`, {
        ticker:    stock.ticker,
        direction,
        qty,
        buy_price: price,
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
    if (prices[ticker] || stock.price || hoverFetchRef.current[ticker]) {
      return;
    }

    hoverFetchRef.current[ticker] = true;
    try {
      const res = await axios.get(`${API}/price/${ticker}`);
      const price = res.data?.price;
      if (price) {
        setStocks(prev => prev.map(s =>
          s.ticker === ticker ? { ...s, price } : s
        ));
      }
    } catch (e) {
      // Ignore hover fetch errors silently to avoid noisy UX.
    } finally {
      hoverFetchRef.current[ticker] = false;
    }
  }

  function handleSuggestionClick(ticker) {
    setSearch(ticker);
    setSuggestions([]);
  }

  function clearSearch() {
    setSearch('');
    setSuggestions([]);
    fetchStocks('');
    searchRef.current?.focus();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.wrapper}>

      {/* Toast notification */}
      {toast && (
        <div style={{
          ...s.toast,
          background:   toast.isError ? '#fef2f2' : '#f0fdf4',
          borderColor:  toast.isError ? '#fca5a5' : '#86efac',
          color:        toast.isError ? '#dc2626' : '#15803d',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header row */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.pageTitle}>
            {mode === 'nifty500' ? 'Nifty 500 Stocks' : 'Search Results'}
          </span>
          <span style={s.badge}>
            {mode === 'nifty500'
              ? `${totalCount} stocks • Real-time constituents`
              : `${totalCount} result${totalCount !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Search bar */}
        <div style={s.searchWrap}>
          <div style={s.searchBox}>
            <span style={s.searchIcon}>🔍</span>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search any NSE stock (ticker or name)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={s.searchInput}
              autoComplete="off"
              spellCheck="false"
            />
            {search && (
              <button onClick={clearSearch} style={s.clearBtn}>✕</button>
            )}
          </div>

          {/* "Did you mean" suggestions dropdown */}
          {suggestions.length > 0 && (
            <div style={s.suggestionBox}>
              {suggestions.map(sug => (
                <div
                  key={sug.ticker}
                  style={s.suggestionItem}
                  onClick={() => handleSuggestionClick(sug.ticker)}
                >
                  <span style={s.sugIcon}>💡</span>
                  <span>
                    Did you mean{' '}
                    <strong>{sug.ticker}</strong>
                    {' — '}{sug.name}?
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mode indicator */}
      {mode === 'search' && (
        <div style={s.searchInfo}>
          Showing results from all <strong>2272 NSE stocks</strong>.{' '}
          <span style={s.clearLink} onClick={clearSearch}>
            ← Back to Nifty 500
          </span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={s.loadingWrap}>
          <div style={s.loadingSpinner} />
          <div style={s.loadingText}>
            {mode === 'nifty500'
              ? 'Loading Nifty 500 stocks...'
              : 'Searching all NSE stocks...'}
          </div>
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div style={s.tableHead}>
            <div style={s.cTicker}>Ticker</div>
            <div style={s.cName}>Company</div>
            <div style={s.cPrice}>Live Price</div>
            <div style={s.cQty}>Qty</div>
            <div style={s.cActions}>Actions</div>
          </div>

          {/* Rows */}
          <div style={s.tableBody}>
            {stocks.length === 0 ? (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>🔎</div>
                <div style={s.emptyTitle}>No stocks found</div>
                <div style={s.emptySub}>
                  Try a different spelling or ticker symbol
                </div>
              </div>
            ) : (
              stocks.map(stock => {
                const livePrice = prices[stock.ticker] ?? stock.price;
                const qty       = getQty(stock.ticker);
                const cost      = livePrice ? qty * livePrice : null;
                const buyKey    = `${stock.ticker}-BUY`;
                const shortKey  = `${stock.ticker}-SHORT`;

                return (
                  <div
                    key={stock.ticker}
                    style={s.row}
                    onMouseEnter={() => fetchPriceOnHover(stock)}
                  >

                    {/* Ticker + match badge */}
                    <div style={s.cTicker}>
                      <span style={s.tickerText}>{stock.ticker}</span>
                      {stock.match_type === 'name' && (
                        <span style={s.matchBadge}>name</span>
                      )}
                    </div>

                    {/* Company name */}
                    <div style={s.cName}>
                      <span style={s.nameText} title={stock.name}>
                        {stock.name}
                      </span>
                    </div>

                    {/* Live price */}
                    <div style={s.cPrice}>
                      {livePrice ? (
                        <span style={s.priceText}>
                          ₹{livePrice.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span style={s.noPrice}>—</span>
                      )}
                    </div>

                    {/* Qty input */}
                    <div style={s.cQty}>
                      <input
                        type="number"
                        min="1"
                        value={qty}
                        onChange={e => setQty(prev => ({
                          ...prev,
                          [stock.ticker]: Math.max(1, parseInt(e.target.value) || 1),
                        }))}
                        style={s.qtyInput}
                      />
                    </div>

                    {/* Actions */}
                    <div style={s.cActions}>
                      {cost && (
                        <span style={s.costText}>
                          ₹{cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      )}
                      <button
                        onClick={() => handleTrade(stock, 'BUY')}
                        disabled={acting[buyKey]}
                        style={{
                          ...s.buyBtn,
                          opacity: acting[buyKey] ? 0.5 : 1,
                          cursor:  acting[buyKey] ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {acting[buyKey] ? '...' : 'BUY'}
                      </button>
                      <button
                        onClick={() => handleTrade(stock, 'SHORT')}
                        disabled={acting[shortKey]}
                        style={{
                          ...s.shortBtn,
                          opacity: acting[shortKey] ? 0.5 : 1,
                          cursor:  acting[shortKey] ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {acting[shortKey] ? '...' : 'SHORT'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  wrapper: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  // Toast
  toast: {
    border: '1px solid', borderRadius: '8px',
    padding: '10px 16px', marginBottom: '14px',
    fontSize: '13px', fontWeight: '500',
  },

  // Header
  header: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: '12px',
    flexWrap: 'wrap', gap: '12px',
  },
  headerLeft: {
    display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
  },
  pageTitle: {
    fontSize: '16px', fontWeight: '700', color: '#111827',
  },
  badge: {
    fontSize: '11px', fontWeight: '500',
    backgroundColor: '#eff6ff', color: '#2563eb',
    padding: '3px 10px', borderRadius: '99px',
  },

  // Search
  searchWrap: {
    position: 'relative', minWidth: '320px',
  },
  searchBox: {
    display: 'flex', alignItems: 'center',
    border: '1.5px solid #d1d5db', borderRadius: '8px',
    backgroundColor: '#fff', overflow: 'hidden',
    transition: 'border-color 0.2s',
  },
  searchIcon: {
    padding: '0 10px', fontSize: '14px', color: '#9ca3af',
  },
  searchInput: {
    flex: 1, padding: '9px 4px', border: 'none', outline: 'none',
    fontSize: '13px', color: '#111827', backgroundColor: 'transparent',
    minWidth: '200px',
  },
  clearBtn: {
    padding: '0 12px', border: 'none', background: 'none',
    fontSize: '13px', color: '#9ca3af', cursor: 'pointer',
  },

  // Suggestion dropdown
  suggestionBox: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    backgroundColor: '#fff', border: '1px solid #e5e7eb',
    borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    zIndex: 100, marginTop: '4px',
  },
  suggestionItem: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
    color: '#374151', transition: 'background 0.15s',
    borderRadius: '8px',
  },
  sugIcon: { fontSize: '14px' },

  // Mode info bar
  searchInfo: {
    fontSize: '12px', color: '#6b7280',
    marginBottom: '10px', padding: '6px 0',
  },
  clearLink: {
    color: '#2563eb', cursor: 'pointer', fontWeight: '500',
    textDecoration: 'underline',
  },

  // Loading
  loadingWrap: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '60px 20px', gap: '14px',
  },
  loadingSpinner: {
    width: '28px', height: '28px',
    border: '3px solid #e5e7eb',
    borderTop: '3px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: '14px', color: '#6b7280', fontWeight: '500',
  },

  // Table
  tableHead: {
    display: 'flex', alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '8px 8px 0 0',
    fontSize: '11px', fontWeight: '600',
    color: '#6b7280', textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  tableBody: {
    border: '1px solid #e5e7eb',
    borderTop: 'none',
    borderRadius: '0 0 8px 8px',
    backgroundColor: '#fff',
    maxHeight: '65vh',
    overflowY: 'auto',
  },
  row: {
    display: 'flex', alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #f3f4f6',
    transition: 'background 0.12s',
  },

  // Columns
  cTicker:  { width: '130px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' },
  cName:    { flex: 1, minWidth: 0, paddingRight: '16px' },
  cPrice:   { width: '110px', flexShrink: 0, textAlign: 'right' },
  cQty:     { width: '80px', flexShrink: 0, textAlign: 'center', padding: '0 10px' },
  cActions: { width: '220px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' },

  // Cell content
  tickerText: {
    fontSize: '13px', fontWeight: '700', color: '#111827',
  },
  matchBadge: {
    fontSize: '9px', fontWeight: '600',
    backgroundColor: '#fef3c7', color: '#92400e',
    padding: '1px 5px', borderRadius: '4px',
  },
  nameText: {
    fontSize: '12px', color: '#374151',
    whiteSpace: 'nowrap', overflow: 'hidden',
    textOverflow: 'ellipsis', display: 'block',
  },
  priceText: {
    fontSize: '13px', fontWeight: '600', color: '#111827',
  },
  noPrice: {
    fontSize: '13px', color: '#d1d5db',
  },
  qtyInput: {
    width: '56px', padding: '5px 6px',
    border: '1px solid #d1d5db', borderRadius: '6px',
    fontSize: '12px', textAlign: 'center', outline: 'none',
  },
  costText: {
    fontSize: '11px', color: '#9ca3af',
    minWidth: '70px', textAlign: 'right',
  },
  buyBtn: {
    padding: '6px 16px', border: 'none',
    borderRadius: '6px', backgroundColor: '#16a34a',
    color: '#fff', fontSize: '12px',
    fontWeight: '700', cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  shortBtn: {
    padding: '6px 12px',
    border: '1.5px solid #fca5a5',
    borderRadius: '6px', backgroundColor: 'transparent',
    color: '#dc2626', fontSize: '12px',
    fontWeight: '700', cursor: 'pointer',
    transition: 'opacity 0.15s',
  },

  // Empty state
  emptyState: {
    textAlign: 'center', padding: '50px 20px',
  },
  emptyIcon: { fontSize: '32px', marginBottom: '10px' },
  emptyTitle: {
    fontSize: '15px', fontWeight: '600',
    color: '#374151', marginBottom: '6px',
  },
  emptySub: {
    fontSize: '13px', color: '#9ca3af',
  },
};
