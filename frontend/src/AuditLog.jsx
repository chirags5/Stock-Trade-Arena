import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function AuditLog({ API }) {
  const [data, setData] = useState(null);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/audit`);
      setData(res.data);
    } catch (e) {
      console.error('Audit fetch error:', e);
    }
  }, [API]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  if (!data) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loadingSpinner} />
        <div style={styles.loadingText}>Loading audit trail...</div>
      </div>
    );
  }

  const { trades, accuracy, total_closed, total_hits } = data;

  return (
    <div style={styles.wrapper}>
      {/* Accuracy Score Panel */}
      {accuracy !== null && (
        <div style={styles.glassPanelSmall}>
          <div style={styles.accHeader}>
            <div>
              <div style={styles.accTitle}>AI Signal Accuracy</div>
              <div style={styles.accSub}>
                {total_hits} correct out of {total_closed} closed trades
              </div>
            </div>
            <div style={{
              ...styles.accScore,
              color: accuracy >= 60 ? 'var(--green-text)' : 'var(--red-text)',
              textShadow: accuracy >= 60 ? '0 0 10px var(--green-bg)' : '0 0 10px var(--red-bg)'
            }}>
              {accuracy}%
            </div>
          </div>
          <div style={styles.barBg}>
            <div style={{
              ...styles.barFill,
              width: `${accuracy}%`,
              backgroundColor: accuracy >= 60 ? 'var(--green-text)' : 'var(--red-text)',
              boxShadow: accuracy >= 60 ? '0 0 10px var(--green-text)' : '0 0 10px var(--red-text)'
            }} />
          </div>
        </div>
      )}

      {/* Trade Log Panel */}
      <div style={styles.glassPanel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>Decision Log</h2>
          <button style={styles.refreshBtn} onClick={fetchAudit}>
            Refresh Log
          </button>
        </div>

        <div style={styles.logContainer}>
          {trades.length === 0 ? (
            <div style={styles.empty}>
              No trades yet. Buy or short a stock to start logging.
            </div>
          ) : (
            trades.map(trade => (
              <div key={trade.id} style={styles.logRow}>
                <div style={styles.logLeft}>
                  <span style={{
                    ...styles.typeBadge,
                    backgroundColor: trade.status === 'OPEN' ? 'var(--tab-shadow)' : trade.pnl > 0 ? 'var(--green-bg)' : 'var(--red-bg)',
                    border: trade.status === 'OPEN' ? '1px solid var(--tab-active)' : trade.pnl > 0 ? '1px solid var(--green-border)' : '1px solid var(--red-border)',
                    color: trade.status === 'OPEN' ? 'var(--tab-active)' : trade.pnl > 0 ? 'var(--green-text)' : 'var(--red-text)',
                  }}>
                    {trade.status === 'OPEN' ? 'OPEN' : trade.pnl > 0 ? 'HIT' : 'MISS'}
                  </span>
                </div>

                <div style={styles.logBody}>
                  <div style={styles.logTitle}>
                    <strong style={{color: 'var(--text-primary)'}}>{trade.ticker}</strong>
                    &nbsp;<span style={{color: 'var(--text-secondary)'}}>·</span>&nbsp;
                    <span style={{color: trade.direction === 'BUY' ? 'var(--green-text)' : 'var(--red-text)'}}>{trade.direction}</span>
                    &nbsp;<span style={{color: 'var(--text-secondary)'}}>·</span>&nbsp;
                    <span style={{color: 'var(--text-primary)'}}>{trade.qty} shares @ ₹{trade.buy_price}</span>
                    
                    {trade.sell_price && (
                      <span style={{ color: trade.pnl >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
                        &nbsp;→ Exited @ ₹{trade.sell_price}
                        &nbsp;(P&L: {trade.pnl >= 0 ? '+' : ''}₹{trade.pnl?.toLocaleString('en-IN')})
                      </span>
                    )}
                  </div>
                  <div style={styles.logPattern}>
                    Pattern: <span style={{color: 'var(--text-primary)'}}>{trade.pattern}</span> &nbsp;·&nbsp;
                    Conviction: <span style={{color: 'var(--text-primary)'}}>{trade.conviction}/100</span>
                  </div>
                  {trade.explanation && (
                    <div style={styles.logReason}>
                      AI reason: "{trade.explanation}"
                    </div>
                  )}
                  <div style={styles.logTime}>
                    {new Date(trade.buy_time).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit'
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: { width: '100%' },
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', gap: '16px' },
  loadingSpinner: { width: '32px', height: '32px', border: '3px solid var(--glass-border)', borderTop: '3px solid var(--tab-active)', borderRadius: '50%' },
  loadingText: { fontSize: '14px', color: 'var(--text-secondary)' },
  
  glassPanelSmall: {
    backgroundColor: 'var(--glass-bg)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '20px',
    boxShadow: 'var(--glass-shadow)',
  },
  glassPanel: {
    backgroundColor: 'var(--glass-bg)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    boxShadow: 'var(--glass-shadow)',
    overflow: 'hidden',
  },
  
  accHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  accTitle: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' },
  accSub: { fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' },
  accScore: { fontSize: '32px', fontWeight: '700' },
  barBg: { height: '6px', backgroundColor: 'var(--table-header-bg)', borderRadius: '99px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '99px' },
  
  panelHeader: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: '20px', 
    borderBottom: '1px solid var(--glass-border)',
    backgroundColor: 'var(--table-header-bg)'
  },
  panelTitle: { fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 },
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
  
  logContainer: { maxHeight: '65vh', overflowY: 'auto', padding: '0 20px' },
  empty: { textAlign: 'center', padding: '50px 20px', color: 'var(--text-secondary)', fontSize: '14px' },
  
  logRow: { 
    display: 'flex', 
    gap: '16px', 
    padding: '20px 0', 
    borderBottom: '1px solid var(--glass-border)', 
    alignItems: 'flex-start' 
  },
  logLeft: { flexShrink: 0, paddingTop: '2px' },
  typeBadge: { fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '6px', letterSpacing: '0.05em' },
  logBody: { flex: 1 },
  logTitle: { fontSize: '14px', marginBottom: '6px' },
  logPattern: { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' },
  logReason: { fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '8px', lineHeight: '1.5', backgroundColor: 'var(--table-header-bg)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid var(--glass-border)' },
  logTime: { fontSize: '12px', color: 'var(--text-secondary)' },
};