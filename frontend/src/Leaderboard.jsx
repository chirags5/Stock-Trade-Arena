import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Leaderboard({ API }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    fetchLeaderboard();
    // Refresh every 30 seconds
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

  if (loading) {
    return <div style={styles.center}>Loading leaderboard...</div>;
  }

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <div style={styles.cardTitle}>Leaderboard</div>
            <div style={styles.cardSub}>
              Ranked by portfolio value · Starting capital ₹10,00,000
            </div>
          </div>
          <button style={styles.refreshBtn} onClick={fetchLeaderboard}>
            Refresh
          </button>
        </div>

        {/* Table Header */}
        <div style={styles.tableHeader}>
          <div style={styles.rankCol}>Rank</div>
          <div style={styles.nameCol}>Trader</div>
          <div style={styles.valCol}>Portfolio Value</div>
          <div style={styles.pnlCol}>P&L</div>
          <div style={styles.pctCol}>Return</div>
        </div>

        {/* Rows */}
        {leaderboard.map((user, index) => {
          const pnl     = user.portfolio_val - 1000000;
          const pct     = ((pnl / 1000000) * 100).toFixed(2);
          const isReal  = user.is_real === 1;
          const isTop3  = index < 3;

          const rankColors = ['#f59e0b', '#9ca3af', '#cd7c3f'];
          const rankColor  = isTop3 ? rankColors[index] : '#d1d5db';

          return (
            <div
              key={user.username}
              style={{
                ...styles.row,
                backgroundColor: isReal ? '#eff6ff' : '#ffffff',
                border: isReal ? '1px solid #bfdbfe' : '1px solid #f3f4f6',
              }}
            >
              {/* Rank */}
              <div style={styles.rankCol}>
                <div style={{
                  ...styles.rankBadge,
                  backgroundColor: isTop3 ? rankColor : '#f3f4f6',
                  color:           isTop3 ? '#ffffff'  : '#6b7280',
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
                    {index === 0 ? 'Top Trader' : index === 1 ? 'Runner Up' : '3rd Place'}
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
                  color: pnl >= 0 ? '#16a34a' : '#dc2626',
                }}>
                  {pnl >= 0 ? '+' : '-'}₹{Math.abs(pnl).toLocaleString('en-IN')}
                </div>
              </div>

              {/* Return % */}
              <div style={styles.pctCol}>
                <div style={{
                  ...styles.pctBadge,
                  backgroundColor: pnl >= 0 ? '#f0fdf4' : '#fef2f2',
                  color:           pnl >= 0 ? '#16a34a' : '#dc2626',
                }}>
                  {pct >= 0 ? '+' : ''}{pct}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={styles.note}>
        Your row updates live as your portfolio value changes.
        Other traders update periodically.
      </div>
    </div>
  );
}

const styles = {
  center: {
    textAlign: 'center',
    padding: '40px',
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '18px 20px',
    marginBottom: '12px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '18px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '3px',
  },
  cardSub: {
    fontSize: '12px',
    color: '#6b7280',
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
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    marginBottom: '6px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '6px',
    transition: 'all 0.2s',
  },
  rankCol: {
    width: '60px',
    flexShrink: 0,
  },
  nameCol: {
    flex: 1,
  },
  valCol: {
    width: '160px',
    textAlign: 'right',
    flexShrink: 0,
  },
  pnlCol: {
    width: '140px',
    textAlign: 'right',
    flexShrink: 0,
  },
  pctCol: {
    width: '90px',
    textAlign: 'right',
    flexShrink: 0,
  },
  rankBadge: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: '700',
  },
  username: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  youBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '1px 7px',
    borderRadius: '99px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  topLabel: {
    fontSize: '11px',
    color: '#9ca3af',
    marginTop: '2px',
  },
  valText: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  pnlText: {
    fontSize: '14px',
    fontWeight: '600',
  },
  pctBadge: {
    display: 'inline-block',
    fontSize: '12px',
    fontWeight: '600',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  note: {
    fontSize: '12px',
    color: '#9ca3af',
    textAlign: 'center',
    padding: '8px',
  },
};