import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AuditLog({ API }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchAudit();
  }, []);

  async function fetchAudit() {
    try {
      const res = await axios.get(`${API}/audit`);
      setData(res.data);
    } catch (e) {
      console.error('Audit fetch error:', e);
    }
  }

  if (!data) return <div style={styles.center}>Loading audit trail...</div>;

  const { trades, accuracy, total_closed, total_hits } = data;

  return (
    <div>
      {/* Accuracy Score */}
      {accuracy !== null && (
        <div style={styles.accCard}>
          <div style={styles.accHeader}>
            <div>
              <div style={styles.accTitle}>AI Signal Accuracy</div>
              <div style={styles.accSub}>
                {total_hits} correct out of {total_closed} closed trades
              </div>
            </div>
            <div style={{
              ...styles.accScore,
              color: accuracy >= 60 ? '#16a34a' : '#dc2626'
            }}>
              {accuracy}%
            </div>
          </div>
          <div style={styles.barBg}>
            <div style={{
              ...styles.barFill,
              width: `${accuracy}%`,
              backgroundColor: accuracy >= 60 ? '#16a34a' : '#dc2626',
            }} />
          </div>
        </div>
      )}

      {/* Trade Log */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitle}>Full Decision Log</div>
          <button style={styles.refreshBtn} onClick={fetchAudit}>
            Refresh
          </button>
        </div>

        {trades.length === 0 ? (
          <div style={styles.empty}>
            No trades yet. Buy or skip a signal to start logging.
          </div>
        ) : (
          trades.map(trade => (
            <div key={trade.id} style={styles.logRow}>
              <div style={styles.logLeft}>
                <span style={{
                  ...styles.typeBadge,
                  backgroundColor:
                    trade.status === 'OPEN'   ? '#eff6ff' :
                    trade.pnl > 0             ? '#f0fdf4' : '#fef2f2',
                  color:
                    trade.status === 'OPEN'   ? '#2563eb' :
                    trade.pnl > 0             ? '#16a34a' : '#dc2626',
                }}>
                  {trade.status === 'OPEN' ? 'OPEN' : trade.pnl > 0 ? 'HIT' : 'MISS'}
                </span>
              </div>

              <div style={styles.logBody}>
                <div style={styles.logTitle}>
                  <strong>{trade.ticker}</strong>
                  &nbsp;·&nbsp;{trade.direction}
                  &nbsp;·&nbsp;{trade.qty} shares @ ₹{trade.buy_price}
                  {trade.sell_price && (
                    <span style={{ color: trade.pnl >= 0 ? '#16a34a' : '#dc2626' }}>
                      &nbsp;→ Exited @ ₹{trade.sell_price}
                      &nbsp;(P&L: {trade.pnl >= 0 ? '+' : ''}₹{trade.pnl?.toLocaleString('en-IN')})
                    </span>
                  )}
                </div>
                <div style={styles.logPattern}>
                  Pattern: {trade.pattern} &nbsp;·&nbsp;
                  Conviction: {trade.conviction}/100
                </div>
                {trade.explanation && (
                  <div style={styles.logReason}>
                    AI reason: "{trade.explanation.substring(0, 120)}..."
                  </div>
                )}
                <div style={styles.logTime}>
                  {new Date(trade.buy_time).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          ))
        )}
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
  accCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '18px 20px',
    marginBottom: '16px',
  },
  accHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  accTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  accSub: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '2px',
  },
  accScore: {
    fontSize: '28px',
    fontWeight: '700',
  },
  barBg: {
    height: '8px',
    backgroundColor: '#f3f4f6',
    borderRadius: '99px',
  },
  barFill: {
    height: '8px',
    borderRadius: '99px',
    transition: 'width 0.6s',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '18px 20px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
  },
  cardTitle: {
    fontSize: '15px',
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
  empty: {
    textAlign: 'center',
    padding: '30px',
    color: '#9ca3af',
    fontSize: '13px',
  },
  logRow: {
    display: 'flex',
    gap: '12px',
    padding: '12px 0',
    borderBottom: '1px solid #f3f4f6',
    alignItems: 'flex-start',
  },
  logLeft: {
    flexShrink: 0,
    paddingTop: '2px',
  },
  typeBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '99px',
  },
  logBody: {
    flex: 1,
  },
  logTitle: {
    fontSize: '13px',
    color: '#1a1a1a',
    marginBottom: '3px',
  },
  logPattern: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '3px',
  },
  logReason: {
    fontSize: '11px',
    color: '#9ca3af',
    fontStyle: 'italic',
    marginBottom: '3px',
    lineHeight: '1.5',
  },
  logTime: {
    fontSize: '11px',
    color: '#d1d5db',
  },
};