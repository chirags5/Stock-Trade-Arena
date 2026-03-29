import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import SignalFeed from './SignalFeed';
import Portfolio from './Portfolio';
import AuditLog from './AuditLog';
import Leaderboard from './Leaderboard';
import BacktestPage from './BacktestPage';
import LandingPage from './LandingPage';
import WatchlistScanner from './WatchlistScanner';   // ← new
import AngelPortfolio from './AngelPortfolio';
import axios from 'axios';

const API  = 'http://localhost:8000';
const TABS = ['Trade', 'Portfolio', 'Audit Trail', 'Leaderboard'];

function PaperTradeArena({ theme, toggleTheme }) {
  const [activeTab, setActiveTab] = useState('Trade');
  const [prices,    setPrices]    = useState({});
  const [portfolio, setPortfolio] = useState(null);

  useEffect(() => {
    fetchPrices();
    fetchPortfolio();
    const interval = setInterval(() => {
      fetchPrices();
      fetchPortfolio();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchPrices() {
    try {
      const res = await axios.get(`${API}/prices`);
      setPrices(res.data.prices);
    } catch (e) { console.error('Price fetch error:', e); }
  }

  async function fetchPortfolio() {
    try {
      const res = await axios.get(`${API}/portfolio`);
      setPortfolio(res.data);
    } catch (e) { console.error('Portfolio fetch error:', e); }
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>Paper Trade Arena</div>
          <div style={styles.headerSub}>Practice trading with ₹10,00,000 virtual money</div>
        </div>
        {portfolio && (
          <div style={styles.headerStats}>
            <div style={{...styles.statBox, ...styles.statBoxNeutral}}>
              <div style={styles.statLabel}>Cash</div>
              <div style={styles.statValue}>₹{portfolio.cash_balance.toLocaleString('en-IN')}</div>
            </div>
            <div style={{...styles.statBox, ...styles.statBoxGold}}>
              <div style={styles.statLabel}>Portfolio</div>
              <div style={styles.statValue}>₹{portfolio.total_value.toLocaleString('en-IN')}</div>
            </div>
            <div style={{...styles.statBox, ...(portfolio.overall_pnl >= 0 ? styles.statBoxGreen : styles.statBoxRed)}}>
              <div style={styles.statLabel}>Total P&L</div>
              <div style={{ ...styles.statValue, color: portfolio.overall_pnl >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
                {portfolio.overall_pnl >= 0 ? '+' : ''}₹{Math.abs(portfolio.overall_pnl).toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{...styles.statBox, ...(portfolio.overall_pnl_pct >= 0 ? styles.statBoxGreen : styles.statBoxRed)}}>
              <div style={styles.statLabel}>Return</div>
              <div style={{ ...styles.statValue, color: portfolio.overall_pnl_pct >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
                {portfolio.overall_pnl_pct >= 0 ? '+' : ''}{portfolio.overall_pnl_pct}%
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={styles.tabsContainer}>
        <div style={styles.tabs}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.content}>
        {activeTab === 'Trade'       && <SignalFeed  API={API} prices={prices} onTrade={fetchPortfolio} />}
        {activeTab === 'Portfolio'   && <Portfolio   API={API} prices={prices} portfolio={portfolio} onExit={fetchPortfolio} />}
        {activeTab === 'Audit Trail' && <AuditLog    API={API} />}
        {activeTab === 'Leaderboard' && <Leaderboard API={API} />}
      </div>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState('dark');
  const navigate  = useNavigate();
  const location  = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const isPaperTrade = location.pathname === '/paper-trade';
  const isBacktest   = location.pathname === '/backtest';
  const isScanner    = location.pathname === '/scanner';   // ← new
  const isAngel      = location.pathname === '/angel';

  return (
    <>
      <nav style={nav.bar}>
        <div style={nav.brand}>📈 Stock Trade Arena</div>
        <div style={nav.links}>
          <button
            onClick={() => navigate('/paper-trade')}
            style={{ ...nav.link, ...(isPaperTrade ? nav.linkActive : {}) }}
          >
            🏛 Paper Trade Arena
          </button>
          <button
            onClick={() => navigate('/backtest')}
            style={{ ...nav.link, ...(isBacktest ? nav.linkActive : {}) }}
          >
            📊 Backtest
          </button>

          {/* ── Scanner nav button (new) ── */}
          <button
            onClick={() => navigate('/scanner')}
            style={{ ...nav.link, ...(isScanner ? nav.linkActive : {}), position: 'relative' }}
          >
            📡 Scanner
            {/* Pulse dot to show it's live */}
            <span style={{
              position: 'absolute', top: 6, right: 6,
              width: 6, height: 6, borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 5px #22c55e',
              animation: 'navPulse 2s infinite',
            }} />
          </button>

          <button
            onClick={() => navigate('/angel')}
            style={{ ...nav.link, ...(isAngel ? nav.linkActive : {}) }}
          >
            🔗 AngelOne
          </button>

          <button onClick={toggleTheme} style={nav.themeBtn}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </nav>

      <Routes>
        <Route path="/"           element={<LandingPage />} />
        <Route path="/paper-trade" element={<PaperTradeArena theme={theme} toggleTheme={toggleTheme} />} />
        <Route path="/backtest"   element={<BacktestPage API={API} />} />
        <Route path="/scanner"    element={<WatchlistScanner />} />  {/* ← new */}
        <Route path="/angel"      element={<AngelPortfolio API={API} />} />
      </Routes>

      <style>{`
        @keyframes navPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
      `}</style>
    </>
  );
}

const nav = {
  bar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 40px',
    height: '56px',
    backgroundColor: 'var(--glass-header)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid var(--glass-border)',
    position: 'sticky',
    top: 0,
    zIndex: 500,
  },
  brand: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    letterSpacing: '0.02em',
  },
  links: { display: 'flex', alignItems: 'center', gap: '8px' },
  link: {
    padding: '8px 18px',
    border: '1px solid transparent',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative',
  },
  linkActive: {
    backgroundColor: 'var(--tab-shadow)',
    border: '1px solid var(--tab-active)',
    color: 'var(--tab-active)',
    fontWeight: '600',
  },
  themeBtn: {
    padding: '8px 12px',
    border: '1px solid var(--glass-border)',
    borderRadius: '8px',
    backgroundColor: 'var(--glass-bg)',
    cursor: 'pointer',
    fontSize: '16px',
    marginLeft: '8px',
  },
};

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    transition: 'all 0.4s ease',
  },
  header: {
    padding: '28px 40px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '24px',
    borderBottom: '1px solid var(--glass-border)',
    backgroundColor: 'var(--glass-header)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  },
  headerTitle: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    letterSpacing: '0.02em',
  },
  headerSub: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    marginTop: '6px',
  },
  headerStats: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  statBox: {
    padding: '12px 20px',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: 'var(--glass-shadow)',
    transition: 'all 0.3s ease',
    minWidth: '140px',
  },
  statBoxNeutral: {
    backgroundColor: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
  },
  statBoxGold: {
    backgroundColor: 'var(--gold-bg)',
    border: '1px solid var(--gold-border)',
  },
  statBoxGreen: {
    backgroundColor: 'var(--green-bg)',
    border: '1px solid var(--green-border)',
  },
  statBoxRed: {
    backgroundColor: 'var(--red-bg)',
    border: '1px solid var(--red-border)',
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '4px',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  tabsContainer: {
    backgroundColor: 'var(--glass-header)',
    borderBottom: '1px solid var(--glass-border)',
    padding: '0 40px',
  },
  tabs: {
    display: 'flex',
    gap: '12px',
  },
  tab: {
    padding: '20px 24px',
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '16px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    borderBottom: '3px solid transparent',
    transition: 'all 0.2s',
    position: 'relative',
    cursor: 'pointer',
  },
  tabActive: {
    color: 'var(--text-primary)',
    borderBottom: '3px solid var(--tab-active)',
    textShadow: '0 0 12px var(--tab-shadow)',
    boxShadow: '0 15px 15px -10px var(--tab-shadow)',
  },
  content: {
    padding: '30px',
    flex: 1,
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%',
  },
};