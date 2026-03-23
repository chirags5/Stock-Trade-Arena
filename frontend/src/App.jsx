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

  // Fetch live prices every 30 seconds
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

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>Paper Trade Arena</div>
          <div style={styles.headerSub}>Practice trading with ₹10,00,000 virtual money</div>
        </div>
        {portfolio && (
          <div style={styles.headerStats}>
            <div style={styles.statItem}>
              <div style={styles.statLabel}>Cash</div>
              <div style={styles.statValue}>
                ₹{portfolio.cash_balance.toLocaleString('en-IN')}
              </div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statLabel}>Portfolio</div>
              <div style={styles.statValue}>
                ₹{portfolio.total_value.toLocaleString('en-IN')}
              </div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statLabel}>Total P&L</div>
              <div style={{
                ...styles.statValue,
                color: portfolio.overall_pnl >= 0 ? '#16a34a' : '#dc2626'
              }}>
                {portfolio.overall_pnl >= 0 ? '+' : ''}
                ₹{Math.abs(portfolio.overall_pnl).toLocaleString('en-IN')}
              </div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statLabel}>Return</div>
              <div style={{
                ...styles.statValue,
                color: portfolio.overall_pnl_pct >= 0 ? '#16a34a' : '#dc2626'
              }}>
                {portfolio.overall_pnl_pct >= 0 ? '+' : ''}
                {portfolio.overall_pnl_pct}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
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

      {/* Tab Content */}
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
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
  },
  headerTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerSub: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '2px',
  },
  headerStats: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap',
  },
  statItem: {
    textAlign: 'right',
  },
  statLabel: {
    fontSize: '11px',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statValue: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  tabs: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    padding: '0 24px',
    display: 'flex',
    gap: '4px',
  },
  tab: {
    padding: '12px 16px',
    border: 'none',
    background: 'transparent',
    fontSize: '13px',
    fontWeight: '500',
    color: '#6b7280',
    borderBottom: '2px solid transparent',
    transition: 'all 0.15s',
  },
  tabActive: {
    color: '#2563eb',
    borderBottom: '2px solid #2563eb',
  },
  content: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
};