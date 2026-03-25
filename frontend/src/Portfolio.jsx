import React, { useState } from 'react';
import axios from 'axios';

export default function Portfolio({ API, prices, portfolio, onExit }) {
  const [editingSlTp, setEditingSlTp] = useState(null);
  const [slTpEdit, setSlTpEdit] = useState({ sl: '', tp: '' });

  async function handleExit(tradeId, ticker) {
    const sellPrice = prices[ticker] || 0;
    try {
      await axios.post(`${API}/exit`, {
        trade_id:   tradeId,
        sell_price: sellPrice,
      });
      onExit();
    } catch (e) {
      alert(e.response?.data?.detail || 'Exit failed');
    }
  }

  async function saveThresholds(tradeId) {
    try {
      await axios.put(`${API}/thresholds/${tradeId}`, {
        stop_loss: slTpEdit.sl ? parseFloat(slTpEdit.sl) : null,
        take_profit: slTpEdit.tp ? parseFloat(slTpEdit.tp) : null,
      });
      setEditingSlTp(null);
      onExit();
    } catch (e) {
      alert('Failed to update thresholds');
    }
  }

  if (!portfolio) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loadingSpinner} />
        <div style={styles.loadingText}>Loading portfolio data...</div>
      </div>
    );
  }

  const { cash_balance, holdings, total_value, overall_pnl, overall_pnl_pct } = portfolio;

  return (
    <div style={styles.wrapper}>
      {/* Glass Summary Cards */}
      <div style={styles.grid4}>
        <div style={{...styles.metricCard, ...styles.cardNeutral}}>
          <div style={styles.metricLabel}>Virtual Cash</div>
          <div style={styles.metricValue}>
            ₹{cash_balance.toLocaleString('en-IN')}
          </div>
        </div>
        <div style={{...styles.metricCard, ...styles.cardGold}}>
          <div style={styles.metricLabel}>Portfolio Value</div>
          <div style={styles.metricValue}>
            ₹{total_value.toLocaleString('en-IN')}
          </div>
        </div>
        <div style={{...styles.metricCard, ...(overall_pnl >= 0 ? styles.cardGreen : styles.cardRed)}}>
          <div style={styles.metricLabel}>Total P&L</div>
          <div style={{ ...styles.metricValue, color: overall_pnl >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
            {overall_pnl >= 0 ? '+' : ''}₹{Math.abs(overall_pnl).toLocaleString('en-IN')}
          </div>
        </div>
        <div style={{...styles.metricCard, ...(overall_pnl_pct >= 0 ? styles.cardGreen : styles.cardRed)}}>
          <div style={styles.metricLabel}>Return</div>
          <div style={{ ...styles.metricValue, color: overall_pnl_pct >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>
            {overall_pnl_pct >= 0 ? '+' : ''}{overall_pnl_pct}%
          </div>
        </div>
      </div>

      {/* Glass Table Panel */}
      <div style={styles.glassPanel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>Open Positions</h2>
        </div>
        
        {holdings.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>📂</div>
            No open positions. Go to the Trade tab and buy something!
          </div>
        ) : (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Stock','Direction','Qty','Bought @','Now @','P&L','Return','Stop Loss','Take Profit',''].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdings.map(h => (
                  <tr key={h.trade_id} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={styles.tickerWrap}>
                          <div style={styles.tickerIcon}>{h.ticker.charAt(0)}</div>
                          <strong style={styles.tickerText}>{h.ticker}</strong>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.dirBadge,
                        backgroundColor: h.direction === 'BUY' ? 'var(--green-bg)' : 'var(--red-bg)',
                        border: h.direction === 'BUY' ? '1px solid var(--green-border)' : '1px solid var(--red-border)',
                        color:           h.direction === 'BUY' ? 'var(--green-text)' : 'var(--red-text)',
                      }}>
                        {h.direction}
                      </span>
                    </td>
                    <td style={styles.td}>{h.qty}</td>
                    <td style={styles.td}>₹{h.buy_price.toLocaleString('en-IN')}</td>
                    <td style={styles.td}>₹{h.current_price.toLocaleString('en-IN')}</td>
                    <td style={{
                      ...styles.td,
                      color:      h.unrealised_pnl >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                      fontWeight: '600',
                    }}>
                      {h.unrealised_pnl >= 0 ? '+' : ''}
                      ₹{Math.abs(h.unrealised_pnl).toLocaleString('en-IN')}
                    </td>
                    <td style={{
                      ...styles.td,
                      color: h.return_pct >= 0 ? 'var(--green-text)' : 'var(--red-text)',
                    }}>
                      {h.return_pct >= 0 ? '+' : ''}{h.return_pct}%
                    </td>
                    <td style={styles.td}>
                      {editingSlTp === h.trade_id ? (
                        <input
                          type="number"
                          placeholder="₹ price"
                          value={slTpEdit.sl}
                          onChange={e => setSlTpEdit(prev => ({ ...prev, sl: e.target.value }))}
                          style={styles.slInput}
                        />
                      ) : (
                        <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>
                          {h.stop_loss ? `₹${h.stop_loss}` : '—'}
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {editingSlTp === h.trade_id ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="number"
                            placeholder="₹ price"
                            value={slTpEdit.tp}
                            onChange={e => setSlTpEdit(prev => ({ ...prev, tp: e.target.value }))}
                            style={styles.slInput}
                          />
                          <button onClick={() => saveThresholds(h.trade_id)} style={styles.saveBtn}>✓</button>
                          <button onClick={() => setEditingSlTp(null)} style={styles.cancelBtn}>✕</button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--green-text)', fontWeight: 600 }}>
                          {h.take_profit ? `₹${h.take_profit}` : '—'}
                        </span>
                      )}
                    </td>
                    <td style={styles.tdRight}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            setEditingSlTp(h.trade_id);
                            setSlTpEdit({ sl: h.stop_loss || '', tp: h.take_profit || '' });
                          }}
                          style={styles.editSlTpBtn}
                        >
                          🛡 Set SL/TP
                        </button>
                        <button
                          onClick={() => handleExit(h.trade_id, h.ticker)}
                          style={styles.exitBtn}
                        >
                          Exit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrapper: { width: '100%', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', gap: '16px' },
  loadingSpinner: { width: '32px', height: '32px', border: '3px solid var(--glass-border)', borderTop: '3px solid var(--tab-active)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText: { fontSize: '14px', color: 'var(--text-secondary)' },
  
  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  metricCard: {
    borderRadius: '12px',
    padding: '16px 20px',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    boxShadow: 'var(--glass-shadow)',
    transition: 'all 0.3s ease', // Smooth theme transitions
  },
  cardNeutral: { backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)' },
  cardGold: { backgroundColor: 'var(--gold-bg)', border: '1px solid var(--gold-border)' },
  cardGreen: { backgroundColor: 'var(--green-bg)', border: '1px solid var(--green-border)' },
  cardRed: { backgroundColor: 'var(--red-bg)', border: '1px solid var(--red-border)' },
  
  metricLabel: { fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' },
  metricValue: { fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' },
  
  glassPanel: {
    backgroundColor: 'var(--glass-bg)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    boxShadow: 'var(--glass-shadow)',
    overflow: 'hidden',
    transition: 'all 0.3s ease', // Smooth theme transitions
  },
  panelHeader: { padding: '20px', borderBottom: '1px solid var(--glass-border)' },
  panelTitle: { fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 },
  
  empty: { textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)', fontSize: '15px' },
  emptyIcon: { fontSize: '32px', marginBottom: '12px', opacity: 0.7 },
  
  tableContainer: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { 
    textAlign: 'left', 
    padding: '16px 20px', 
    fontSize: '12px', 
    fontWeight: '500', 
    color: 'var(--text-secondary)', 
    textTransform: 'uppercase', 
    letterSpacing: '0.05em', 
    backgroundColor: 'rgba(0,0,0,0.05)', // Kept slightly dark for contrast in both modes
    borderBottom: '1px solid var(--glass-border)' 
  },
  tr: { borderBottom: '1px solid var(--glass-border)', transition: 'background 0.2s' },
  td: { padding: '16px 20px', color: 'var(--text-primary)', verticalAlign: 'middle', transition: 'color 0.3s ease' },
  tdRight: { padding: '16px 20px', textAlign: 'right', verticalAlign: 'middle' },
  
  tickerWrap: { display: 'flex', alignItems: 'center', gap: '12px' },
  tickerIcon: {
    width: '28px', height: '28px',
    backgroundColor: 'var(--glass-border)',
    borderRadius: '6px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)'
  },
  tickerText: { fontSize: '15px', fontWeight: '600' },
  
  dirBadge: { fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '6px' },

  slInput: {
    width: '90px',
    padding: '5px 8px',
    border: '1px solid var(--glass-border)',
    borderRadius: '6px',
    fontSize: '12px',
    outline: 'none',
    backgroundColor: 'var(--input-bg)',
    color: 'var(--text-primary)',
  },
  editSlTpBtn: {
    padding: '6px 10px',
    border: '1px solid var(--glass-border)',
    borderRadius: '6px',
    backgroundColor: 'var(--table-header-bg)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '5px 10px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#4caf50',
    color: '#fff',
    fontSize: '13px',
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '5px 10px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'var(--table-header-bg)',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    cursor: 'pointer',
  },
  
  exitBtn: { 
    padding: '6px 14px', 
    border: '1px solid var(--red-border)', 
    borderRadius: '6px', 
    backgroundColor: 'var(--red-bg)', 
    color: 'var(--red-text)', 
    fontSize: '13px', 
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backdropFilter: 'blur(4px)'
  },
};