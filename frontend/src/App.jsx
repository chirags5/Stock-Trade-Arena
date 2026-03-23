import React, { useState, useEffect } from 'react';
import SignalFeed from './SignalFeed';
import Portfolio from './Portfolio';
import AuditLog from './AuditLog';
import Leaderboard from './Leaderboard';
import axios from 'axios';

const API = 'http://localhost:8000';
const TABS = ['Trade', 'Portfolio', 'Audit Trail', 'Leaderboard'];

export default function App() {
  const [activeTab, setActiveTab]   = useState('Trade');
  const [prices, setPrices]         = useState({});
  const [portfolio, setPortfolio]   = useState(null);
  
  // 1. Add Theme State (Default to dark to keep your original vibe)
  const [theme, setTheme] = useState('dark');

  // 2. Apply theme to HTML root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

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
    } catch (e) {
      console.error('Price fetch error:', e);
    }
  }

  async function fetchPortfolio() {
    try {
      const res = await axios.get(`${API}/portfolio`);
      setPortfolio(res.data);
    } catch (e) {
      console.error('Portfolio fetch error:', e);
    }
  }

  return (
    <div style={styles.root}>
      {/* Top Header Section */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>Paper Trade Arena</div>
          <div style={styles.headerSub}>Practice trading with ₹10,00,000 virtual money</div>
        </div>
        
        {/* Theme Toggle Button */}
        <button onClick={toggleTheme} style={styles.themeToggle}>
          {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
        
        {/* Glass Stat Boxes */}
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

      {/* Tabs Section with Glowing Active State */}
      <div style={styles.tabsContainer}>
        <div style={styles.tabs}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                ...styles.tab,
                ...(activeTab === tab ? styles.tabActive : {})
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={styles.content}>
        {activeTab === 'Trade'       && <SignalFeed API={API} prices={prices} onTrade={fetchPortfolio} />}
        {activeTab === 'Portfolio'   && <Portfolio  API={API} prices={prices} portfolio={portfolio} onExit={fetchPortfolio} />}
        {activeTab === 'Audit Trail' && <AuditLog   API={API} />}
        {activeTab === 'Leaderboard' && <Leaderboard API={API} />}
      </div>
    </div>
  );
}

const styles = {
  root: { 
    minHeight: '100vh', 
    display: 'flex', 
    flexDirection: 'column',
    transition: 'all 0.4s ease' // Added for smooth theme transitions
  },
  header: { 
    padding: '28px 40px', 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    flexWrap: 'wrap', 
    gap: '24px', 
    borderBottom: '1px solid var(--glass-border)', // Updated
    backgroundColor: 'var(--glass-header)', // Updated
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  },
  headerTitle: { 
    fontSize: '28px', 
    fontWeight: '700', 
    color: 'var(--text-primary)', // Updated
    letterSpacing: '0.02em',
  },
  headerSub: { 
    fontSize: '14px', 
    color: 'var(--text-secondary)', // Updated
    marginTop: '6px' 
  },
  themeToggle: {
    padding: '8px 16px',
    borderRadius: '20px',
    border: '1px solid var(--glass-border)',
    backgroundColor: 'var(--glass-bg)',
    color: 'var(--text-primary)',
    fontWeight: '600',
    backdropFilter: 'blur(10px)',
    transition: 'all 0.3s ease',
  },
  headerStats: { 
    display: 'flex', 
    gap: '16px', 
    flexWrap: 'wrap' 
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
    boxShadow: 'var(--glass-shadow)', // Updated
    transition: 'all 0.3s ease',
    minWidth: '140px', 
  },
  statBoxNeutral: {
    backgroundColor: 'var(--glass-bg)', // Updated
    border: '1px solid var(--glass-border)', // Updated
  },
  statBoxGold: {
    backgroundColor: 'var(--gold-bg)', // Updated
    border: '1px solid var(--gold-border)', // Updated
  },
  statBoxGreen: {
    backgroundColor: 'var(--green-bg)', // Updated
    border: '1px solid var(--green-border)', // Updated
  },
  statBoxRed: {
    backgroundColor: 'var(--red-bg)', // Updated
    border: '1px solid var(--red-border)', // Updated
  },
  statLabel: { 
    fontSize: '12px', 
    color: 'var(--text-secondary)', // Updated
    textTransform: 'uppercase', 
    letterSpacing: '0.08em',
    marginBottom: '4px'
  },
  statValue: { 
    fontSize: '18px', 
    fontWeight: '700', 
    color: 'var(--text-primary)' // Updated
  },
  tabsContainer: {
    backgroundColor: 'var(--glass-header)', // Updated
    borderBottom: '1px solid var(--glass-border)', // Updated
    padding: '0 40px', 
  },
  tabs: { 
    display: 'flex', 
    gap: '12px',
  },
  tab: { 
    padding: '20px 24px', 
    border: 'none', 
    background: 'transparent', 
    fontSize: '16px', 
    fontWeight: '500', 
    color: 'var(--text-secondary)', // Updated
    borderBottom: '3px solid transparent', 
    transition: 'all 0.2s',
    position: 'relative',
    cursor: 'pointer'
  },
  tabActive: { 
    color: 'var(--text-primary)', // Updated
    borderBottom: '3px solid var(--tab-active)', // Updated
    textShadow: '0 0 12px var(--tab-shadow)', // Updated
    boxShadow: '0 15px 15px -10px var(--tab-shadow)' // Updated
  },
  content: { 
    padding: '30px', 
    flex: 1,
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%'
  },
};