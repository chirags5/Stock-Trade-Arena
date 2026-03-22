import React from 'react';
import axios from 'axios';

export default function Portfolio({ API, prices, portfolio, onExit }) {

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

  if (!portfolio) {
    return <div style={styles.center}>Loading portfolio...</div>;
  }

  const { cash_balance, holdings, total_value, overall_pnl, overall_pnl_pct } = portfolio;

  return (
    <div>
      {/* Summary Cards */}
      <div style={styles.grid4}>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Virtual Cash</div>
          <div style={styles.metricValue}>
            ₹{cash_balance.toLocaleString('en-IN')}
          </div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Portfolio Value</div>
          <div style={styles.metricValue}>
            ₹{total_value.toLocaleString('en-IN')}
          </div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Total P&L</div>
          <div style={{
            ...styles.metricValue,
            color: overall_pnl >= 0 ? '#16a34a' : '#dc2626'
          }}>
            {overall_pnl >= 0 ? '+' : ''}₹{Math.abs(overall_pnl).toLocaleString('en-IN')}
          </div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Return</div>
          <div style={{
            ...styles.metricValue,
            color: overall_pnl_pct >= 0 ? '#16a34a' : '#dc2626'
          }}>
            {overall_pnl_pct >= 0 ? '+' : ''}{overall_pnl_pct}%
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Open Positions</div>
        {holdings.length === 0 ? (
          <div style={styles.empty}>
            No open positions. Go to Signals tab and buy something!
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {['Stock','Direction','Qty','Bought @','Now @','P&L','Return',''].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map(h => (
                <tr key={h.trade_id} style={styles.tr}>
                  <td style={styles.td}>
                    <strong>{h.ticker}</strong>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.dirBadge,
                      backgroundColor: h.direction === 'BUY' ? '#f0fdf4' : '#fef2f2',
                      color:           h.direction === 'BUY' ? '#16a34a' : '#dc2626',
                    }}>
                      {h.direction}
                    </span>
                  </td>
                  <td style={styles.td}>{h.qty}</td>
                  <td style={styles.td}>₹{h.buy_price.toLocaleString('en-IN')}</td>
                  <td style={styles.td}>₹{h.current_price.toLocaleString('en-IN')}</td>
                  <td style={{
                    ...styles.td,
                    color:      h.unrealised_pnl >= 0 ? '#16a34a' : '#dc2626',
                    fontWeight: '600',
                  }}>
                    {h.unrealised_pnl >= 0 ? '+' : ''}
                    ₹{Math.abs(h.unrealised_pnl).toLocaleString('en-IN')}
                  </td>
                  <td style={{
                    ...styles.td,
                    color: h.return_pct >= 0 ? '#16a34a' : '#dc2626',
                  }}>
                    {h.return_pct >= 0 ? '+' : ''}{h.return_pct}%
                  </td>
                  <td style={styles.td}>
                    <button
                      onClick={() => handleExit(h.trade_id, h.ticker)}
                      style={styles.exitBtn}
                    >
                      Exit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  metricCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '14px 16px',
  },
  metricLabel: {
    fontSize: '11px',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '4px',
  },
  metricValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '18px 20px',
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '14px',
  },
  empty: {
    textAlign: 'center',
    padding: '30px',
    color: '#9ca3af',
    fontSize: '13px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px solid #e5e7eb',
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '10px 10px',
    color: '#1a1a1a',
    verticalAlign: 'middle',
  },
  dirBadge: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '99px',
  },
  exitBtn: {
    padding: '4px 12px',
    border: '1px solid #fca5a5',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#dc2626',
    fontSize: '12px',
    cursor: 'pointer',
  },
};