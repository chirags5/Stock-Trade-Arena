import React, { useState } from 'react';
import axios from 'axios';

export default function AngelPortfolio({ API }) {
  const [form, setForm] = useState({ apiKey: '', clientId: '', password: '', totpSecret: '' });
  const [sessionToken, setSession] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    if (!form.apiKey || !form.clientId || !form.password || !form.totpSecret) {
      setError('Please fill in all fields.');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const res = await axios.post(`${API}/angel/connect`, {
        api_key: form.apiKey,
        client_id: form.clientId,
        password: form.password,
        totp_secret: form.totpSecret,
      });
      setSession(res.data.session_token);
      await loadHoldings(res.data.session_token);
    } catch (e) {
      setError(e.response?.data?.detail || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }

  async function loadHoldings(token) {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API}/angel/holdings`, {
        headers: { 'X-Session-Token': token || sessionToken },
      });
      setHoldings(res.data.holdings);
      setSummary({
        invested: res.data.total_invested,
        current: res.data.total_current_value,
        pnl: res.data.total_pnl,
      });
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load holdings');
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    try {
      await axios.delete(`${API}/angel/disconnect`, { headers: { 'X-Session-Token': sessionToken } });
    } catch (_) {
      // Ignore disconnect errors and clear local session anyway.
    }
    setSession(null);
    setHoldings([]);
    setSummary(null);
  }

  const fmt = (v) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v);

  if (!sessionToken) {
    return (
      <div style={s.wrapper}>
        <h1 style={s.title}>🔗 AngelOne Portfolio</h1>
        <p style={s.sub}>Connect your AngelOne account to view real holdings alongside your paper trades.</p>
        <div style={s.card}>
          {[
            { label: 'Smart API Key', key: 'apiKey', type: 'text', placeholder: 'aBcDeFgH1234' },
            { label: 'Client ID', key: 'clientId', type: 'text', placeholder: 'A123456' },
            { label: 'Password / PIN', key: 'password', type: 'password', placeholder: 'AngelOne PIN' },
            { label: 'TOTP Secret', key: 'totpSecret', type: 'password', placeholder: 'Base32 secret key' },
          ].map((f) => (
            <div key={f.key} style={s.field}>
              <label style={s.label}>{f.label}</label>
              <input
                style={s.input}
                type={f.type}
                placeholder={f.placeholder}
                value={form[f.key]}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          {error && <div style={s.errorBox}>⚠️ {error}</div>}
          <button style={s.btn} onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting...' : '▶ Connect Account'}
          </button>
          <p style={s.hint}>Credentials go only to your local server - never stored.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrapper}>
      <div style={s.header}>
        <h1 style={s.title}>📊 AngelOne Holdings</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={s.secondaryBtn} onClick={() => loadHoldings()}>↻ Refresh</button>
          <button style={{ ...s.secondaryBtn, color: 'var(--red-text)' }} onClick={disconnect}>Disconnect</button>
        </div>
      </div>

      {summary && (
        <div style={s.summaryGrid}>
          {[
            { label: 'Invested', val: fmt(summary.invested), neutral: true },
            { label: 'Current Value', val: fmt(summary.current), neutral: true },
            { label: 'Total P&L', val: fmt(summary.pnl), good: summary.pnl >= 0 },
          ].map((c) => (
            <div key={c.label} style={{ ...s.summaryCard, ...(c.neutral ? {} : c.good ? s.green : s.red) }}>
              <div style={s.summaryLabel}>{c.label}</div>
              <div
                style={{
                  ...s.summaryVal,
                  color: c.neutral ? 'var(--text-primary)' : c.good ? 'var(--green-text)' : 'var(--red-text)',
                }}
              >
                {c.val}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && <div style={s.loading}>Loading holdings...</div>}
      {error && <div style={s.errorBox}>⚠️ {error}</div>}

      {!loading && holdings.length > 0 && (
        <div style={s.tableCard}>
          <table style={s.table}>
            <thead>
              <tr>{['Symbol', 'Qty', 'Avg Price', 'LTP', 'P&L'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr key={i} style={s.tr}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600 }}>{h.tradingsymbol}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{h.exchange}</div>
                  </td>
                  <td style={s.td}>{h.quantity}</td>
                  <td style={s.td}>₹{h.average_price.toFixed(2)}</td>
                  <td style={s.td}>₹{h.ltp.toFixed(2)}</td>
                  <td style={{ ...s.td, color: h.pnl >= 0 ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 600 }}>
                    {h.pnl >= 0 ? '+' : ''}₹{Math.abs(h.pnl).toFixed(2)}
                    <div style={{ fontSize: '11px' }}>{h.pnl_percentage >= 0 ? '+' : ''}{h.pnl_percentage.toFixed(2)}%</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  wrapper: { minHeight: '100vh', padding: '32px 40px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  title: { fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 8px 0' },
  sub: { fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' },
  card: {
    maxWidth: '480px',
    backgroundColor: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: '14px',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  input: {
    padding: '11px 14px',
    border: '1px solid var(--glass-border)',
    borderRadius: '8px',
    backgroundColor: 'var(--input-bg)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  btn: {
    padding: '13px',
    background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '8px 16px',
    border: '1px solid var(--glass-border)',
    borderRadius: '8px',
    background: 'var(--glass-bg)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    cursor: 'pointer',
  },
  hint: { fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' },
  errorBox: {
    backgroundColor: 'var(--red-bg)',
    border: '1px solid var(--red-border)',
    color: 'var(--red-text)',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '13px',
  },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '24px' },
  summaryCard: {
    backgroundColor: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: '10px',
    padding: '18px 20px',
  },
  summaryLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '8px',
  },
  summaryVal: { fontSize: '22px', fontWeight: '700' },
  green: { backgroundColor: 'var(--green-bg)', border: '1px solid var(--green-border)' },
  red: { backgroundColor: 'var(--red-bg)', border: '1px solid var(--red-border)' },
  loading: { textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' },
  tableCard: {
    backgroundColor: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    textTransform: 'uppercase',
    backgroundColor: 'var(--table-header-bg)',
    borderBottom: '1px solid var(--glass-border)',
  },
  tr: { borderBottom: '1px solid var(--glass-border)' },
  td: { padding: '14px 16px', color: 'var(--text-primary)' },
};
