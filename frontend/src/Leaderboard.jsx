import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Leaderboard({ API }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchLeaderboard() {
    try {
      const res = await axios.get(`${API}/leaderboard`);
      setLeaderboard(res.data.leaderboard || []);
    } catch (e) {
      console.error('Leaderboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.glassPanel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.panelTitle}>Leaderboard</h2>
            <div style={styles.panelSub}>Ranked by portfolio value · Starting capital ₹10,00,000</div>
          </div>
          <button style={styles.refreshBtn} onClick={fetchLeaderboard}>
            Refresh
          </button>
        </div>

        <div style={styles.tableHeader}>
          <div style={styles.rankCol}>Rank</div>
          <div style={styles.nameCol}>Trader</div>
          <div style={styles.valCol}>Portfolio Value</div>
          <div style={styles.pnlCol}>P&L</div>
          <div style={styles.pctCol}>Return</div>
        </div>

        <div style={styles.listContainer}>
          {leaderboard.map((user, index) => {
            const pnl    = user.portfolio_val - 1000000;
            const pct    = ((pnl / 1000000) * 100).toFixed(2);
            const isReal = user.is_real === 1;
            const isTop3 = index < 3;

            const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32']; // Hardcoded medals
            const rankColor  = isTop3 ? rankColors[index] : 'var(--glass-border)';

            return (
              <div
                key={user.username}
                style={{
                  ...styles.row,
                  backgroundColor: isReal ? 'var(--tab-shadow)' : 'transparent',
                  border: isReal ? '1px solid var(--tab-active)' : '1px solid transparent',
                  borderBottom: isReal ? '1px solid var(--tab-active)' : '1px solid var(--glass-border)',
                  boxShadow: isReal ? '0 0 20px var(--tab-shadow) inset' : 'none'
                }}
              >
                {/* Rank */}
                <div style={styles.rankCol}>
                  <div style={{
                    ...styles.rankBadge,
                    backgroundColor: isTop3 ? rankColor : 'var(--table-header-bg)',
                    color:           isTop3 ? '#000000' : 'var(--text-secondary)',
                    boxShadow:       isTop3 ? `0 0 10px ${rankColor}` : 'none'
                  }}>
                    {index + 1}
                  </div>
                </div>

                {/* Name */}
                <div style={styles.nameCol}>
                  <div style={styles.username}>
                    {user.username}
                    {isReal && (
                      <span style={styles.youBadge}>YOU</span>
                    )}
                  </div>
                  {isTop3 && (
                    <div style={styles.topLabel}>
                      {index === 0 ? '🏆 Top Trader' : index === 1 ? '🥈 Runner Up' : '🥉 3rd Place'}
                    </div>
                  )}
                </div>

                {/* Portfolio Value */}
                <div style={styles.valCol}>
                  <div style={styles.valText}>
                    ₹{user.portfolio_val.toLocaleString('en-IN')}
                  </div>
                </div>

                {/* P&L */}
                <div style={styles.pnlCol}>
                  <div style={{
                    ...styles.pnlText,
                    color: pnl >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                  }}>
                    {pnl >= 0 ? '+' : '-'}₹{Math.abs(pnl).toLocaleString('en-IN')}
                  </div>
                </div>

                {/* Return % */}
                <div style={styles.pctCol}>
                  <div style={{
                    ...styles.pctBadge,
                    backgroundColor: pnl >= 0 ? 'var(--green-bg)' : 'var(--red-bg)',
                    border:          pnl >= 0 ? '1px solid var(--green-border)' : '1px solid var(--red-border)',
                    color:           pnl >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                  }}>
                    {pct >= 0 ? '+' : ''}{pct}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={styles.note}>
        Your row updates live as your portfolio value changes. Other traders update periodically.
      </div>
    </div>
  );
}

const styles = {
  wrapper: { width: '100%' },
  
  glassPanel: {
    backgroundColor: 'var(--glass-bg)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    boxShadow: 'var(--glass-shadow)',
    overflow: 'hidden',
    marginBottom: '16px',
    transition: 'all 0.3s ease',
  },
  panelHeader: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: '24px', 
    borderBottom: '1px solid var(--glass-border)',
    backgroundColor: 'var(--table-header-bg)'
  },
  panelTitle: { fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 6px 0' },
  panelSub: { fontSize: '13px', color: 'var(--text-secondary)' },
  
  refreshBtn: { 
    padding: '8px 16px', 
    border: '1px solid var(--glass-border)', 
    borderRadius: '6px', 
    background: 'var(--table-header-bg)', 
    fontSize: '13px', 
    color: 'var(--text-primary)', 
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 24px',
    backgroundColor: 'var(--table-header-bg)',
    borderBottom: '1px solid var(--glass-border)',
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  
  listContainer: { padding: '10px 24px 24px 24px' },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    borderRadius: '10px',
    marginBottom: '8px',
    transition: 'all 0.2s',
  },
  
  rankCol: { width: '70px', flexShrink: 0 },
  nameCol: { flex: 1 },
  valCol: { width: '160px', textAlign: 'right', flexShrink: 0 },
  pnlCol: { width: '140px', textAlign: 'right', flexShrink: 0 },
  pctCol: { width: '100px', textAlign: 'right', flexShrink: 0 },
  
  rankBadge: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '700',
  },
  username: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  youBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '99px',
    backgroundColor: 'var(--tab-shadow)',
    border: '1px solid var(--tab-active)',
    color: 'var(--tab-active)',
  },
  topLabel: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' },
  
  valText: { fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' },
  pnlText: { fontSize: '15px', fontWeight: '600' },
  pctBadge: {
    display: 'inline-block',
    fontSize: '13px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '6px',
    backdropFilter: 'blur(4px)',
  },
  
  note: { fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '10px' },
};