import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = 'http://localhost:8000';

const FEATURES = [
  {
    route: '/paper-trade',
    icon: '🏛',
    title: 'Paper Trade Arena',
    subtitle: 'Practice trading with virtual money',
    description: 'Trade NSE/BSE stocks with ₹10,00,000 virtual capital. Track your portfolio, P&L, and compete on the leaderboard — zero real money risk.',
    color: '#818cf8',
    tags: ['Virtual ₹10L', 'Live Prices', 'Leaderboard'],
    pulse: false,
  },
  {
    route: '/backtest',
    icon: '📊',
    title: 'Backtest',
    subtitle: 'Test strategies on historical data',
    description: 'Replay your trading strategies against past market data. Measure win rate, drawdown, and returns before risking real capital.',
    color: '#f59e0b',
    tags: ['Historical Data', 'Win Rate', 'Drawdown Analysis'],
    pulse: false,
  },
  {
    route: '/scanner',
    icon: '📡',
    title: 'Pattern Scanner',
    subtitle: 'Real-time NSE/BSE pattern detection',
    description: 'Auto-scan your watchlist every 15 minutes during market hours. Get BUY/SELL signals with confidence scores via Telegram or Email alerts.',
    color: '#22c55e',
    tags: ['Auto Scan', 'Live Signals', 'Alerts'],
    pulse: true,
  },
  {
    route: '/angel',
    icon: '🔗',
    title: 'AngelOne Portfolio',
    subtitle: 'Connect your real broker account',
    description: 'Connect your AngelOne account and view live holdings, invested value, and running P&L alongside your paper trading setup.',
    color: '#06b6d4',
    tags: ['Broker Connect', 'Live Holdings', 'Real P&L'],
    pulse: false,
  },
];

export default function LandingPage() {
  const navigate  = useNavigate();
  const [hovered, setHovered] = useState(null);
  const [portfolio, setPortfolio] = useState(null);

  useEffect(() => {
    axios.get(`${API}/portfolio`).then(r => setPortfolio(r.data)).catch(() => {});
  }, []);

  return (
    <div style={s.root}>

      {/* ── Hero ── */}
      <div style={s.hero}>
        <div style={s.heroGlow} />
        <div style={s.heroContent}>
          <div style={s.badge}>📈 Stock Trade Arena</div>
          <h1 style={s.heroTitle}>
            Your Personal<br />
            <span style={{ color: '#818cf8' }}>Trading Lab</span>
          </h1>
          <p style={s.heroSub}>
            Practice, analyse, and scan Indian markets — all in one place.<br />
            No real money. Pure skill-building.
          </p>

          {/* Portfolio quick-stat if available */}
          {portfolio && (
            <div style={s.heroStats}>
              <div style={s.heroStat}>
                <span style={s.heroStatLabel}>Cash Balance</span>
                <span style={s.heroStatValue}>₹{portfolio.cash_balance?.toLocaleString('en-IN')}</span>
              </div>
              <div style={s.heroStatDivider} />
              <div style={s.heroStat}>
                <span style={s.heroStatLabel}>Portfolio Value</span>
                <span style={s.heroStatValue}>₹{portfolio.total_value?.toLocaleString('en-IN')}</span>
              </div>
              <div style={s.heroStatDivider} />
              <div style={s.heroStat}>
                <span style={s.heroStatLabel}>Total P&L</span>
                <span style={{
                  ...s.heroStatValue,
                  color: portfolio.overall_pnl >= 0 ? '#22c55e' : '#ef4444',
                }}>
                  {portfolio.overall_pnl >= 0 ? '+' : ''}₹{Math.abs(portfolio.overall_pnl)?.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Feature Cards ── */}
      <div style={s.cardsSection}>
        <p style={s.cardsLabel}>Choose where to go</p>
        <div style={s.cardsGrid}>
          {FEATURES.map((f, i) => {
            const isHovered = hovered === i;
            return (
              <div
                key={f.route}
                onClick={() => navigate(f.route)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  ...s.card,
                  borderColor: isHovered ? f.color + '88' : 'rgba(148,163,184,0.12)',
                  boxShadow: isHovered
                    ? `0 0 32px ${f.color}22, 0 8px 32px rgba(0,0,0,0.3)`
                    : '0 2px 12px rgba(0,0,0,0.2)',
                  transform: isHovered ? 'translateY(-6px)' : 'translateY(0)',
                }}
              >
                {/* Top accent bar */}
                <div style={{
                  ...s.cardAccent,
                  background: `linear-gradient(90deg, ${f.color} 0%, ${f.color}44 100%)`,
                  opacity: isHovered ? 1 : 0.5,
                }} />

                {/* Icon + live pulse */}
                <div style={s.cardIconRow}>
                  <div style={{
                    ...s.cardIconBox,
                    background: f.color + '18',
                    border: `1px solid ${f.color}33`,
                  }}>
                    <span style={{ fontSize: 28 }}>{f.icon}</span>
                  </div>
                  {f.pulse && (
                    <span style={s.liveChip}>
                      <span style={s.liveDot} />
                      LIVE
                    </span>
                  )}
                </div>

                {/* Title */}
                <div style={{ ...s.cardTitle, color: isHovered ? f.color : 'var(--text-primary, #f1f5f9)' }}>
                  {f.title}
                </div>
                <div style={s.cardSubtitle}>{f.subtitle}</div>

                {/* Description */}
                <div style={s.cardDesc}>{f.description}</div>

                {/* Tags */}
                <div style={s.tagRow}>
                  {f.tags.map(tag => (
                    <span key={tag} style={{ ...s.tag, color: f.color, background: f.color + '15', border: `1px solid ${f.color}33` }}>
                      {tag}
                    </span>
                  ))}
                </div>

                {/* CTA arrow */}
                <div style={{
                  ...s.cardCta,
                  color: f.color,
                  opacity: isHovered ? 1 : 0,
                }}>
                  Open {f.title} →
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes heroPulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes dotPulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
      `}</style>
    </div>
  );
}

const s = {
  root: {
    minHeight: '100vh',
    background: 'var(--bg, #0f172a)',
    color: 'var(--text-primary, #f1f5f9)',
    display: 'flex',
    flexDirection: 'column',
  },

  // ── Hero ──
  hero: {
    position: 'relative',
    padding: '80px 40px 60px',
    textAlign: 'center',
    overflow: 'hidden',
    borderBottom: '1px solid rgba(148,163,184,0.1)',
  },
  heroGlow: {
    position: 'absolute', top: -80, left: '50%',
    transform: 'translateX(-50%)',
    width: 600, height: 300,
    borderRadius: '50%',
    background: 'radial-gradient(ellipse, rgba(129,140,248,0.15) 0%, transparent 70%)',
    pointerEvents: 'none',
    animation: 'heroPulse 4s ease-in-out infinite',
  },
  heroContent: { position: 'relative', zIndex: 1 },
  badge: {
    display: 'inline-block',
    padding: '6px 18px', borderRadius: 999,
    fontSize: 13, fontWeight: 700,
    background: 'rgba(129,140,248,0.12)',
    border: '1px solid rgba(129,140,248,0.3)',
    color: '#818cf8', marginBottom: 24, letterSpacing: '0.06em',
  },
  heroTitle: {
    margin: '0 0 20px',
    fontSize: 'clamp(32px, 5vw, 56px)',
    fontWeight: 800,
    lineHeight: 1.15,
    color: 'var(--text-primary, #f1f5f9)',
  },
  heroSub: {
    fontSize: 17, color: 'var(--text-secondary, #94a3b8)',
    lineHeight: 1.7, margin: '0 auto 32px', maxWidth: 520,
  },
  heroStats: {
    display: 'inline-flex', alignItems: 'center', gap: 0,
    padding: '14px 28px', borderRadius: 14,
    background: 'rgba(30,41,59,0.8)',
    border: '1px solid rgba(148,163,184,0.12)',
    backdropFilter: 'blur(12px)',
    flexWrap: 'wrap', justifyContent: 'center',
  },
  heroStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 20px' },
  heroStatLabel: { fontSize: 11, color: 'var(--text-secondary, #94a3b8)', fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 },
  heroStatValue: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary, #f1f5f9)' },
  heroStatDivider: { width: 1, height: 36, background: 'rgba(148,163,184,0.15)' },

  // ── Cards ──
  cardsSection: {
    padding: '56px 40px 72px',
    maxWidth: 1200,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
  },
  cardsLabel: {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.12em',
    color: 'var(--text-secondary, #94a3b8)',
    textTransform: 'uppercase', marginBottom: 28, textAlign: 'center',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 24,
  },
  card: {
    position: 'relative',
    background: 'rgba(30,41,59,0.8)',
    border: '1px solid rgba(148,163,184,0.12)',
    borderRadius: 18,
    padding: '28px 26px 24px',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    backdropFilter: 'blur(12px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    transition: 'opacity 0.25s',
  },
  cardIconRow: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 18,
  },
  cardIconBox: {
    width: 56, height: 56, borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  liveChip: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '4px 10px', borderRadius: 999,
    background: '#22c55e18', border: '1px solid #22c55e44',
    fontSize: 10, fontWeight: 800, color: '#22c55e', letterSpacing: '0.08em',
  },
  liveDot: {
    display: 'inline-block', width: 6, height: 6,
    borderRadius: '50%', background: '#22c55e',
    animation: 'dotPulse 1.5s infinite',
  },
  cardTitle: {
    fontSize: 20, fontWeight: 800,
    marginBottom: 4, transition: 'color 0.2s',
  },
  cardSubtitle: {
    fontSize: 13, color: 'var(--text-secondary, #94a3b8)',
    fontWeight: 500, marginBottom: 14,
  },
  cardDesc: {
    fontSize: 14, color: 'var(--text-secondary, #94a3b8)',
    lineHeight: 1.7, marginBottom: 18, flex: 1,
  },
  tagRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 },
  tag: {
    fontSize: 11, fontWeight: 700, padding: '3px 10px',
    borderRadius: 999, letterSpacing: '0.04em',
  },
  cardCta: {
    fontSize: 13, fontWeight: 700,
    transition: 'opacity 0.2s',
    marginTop: 4,
  },
};
