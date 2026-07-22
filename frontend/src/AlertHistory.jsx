import { useEffect, useRef } from 'react';

const ATTACK_COLORS = {
  SPIKE:          '#e11d48',
  DRIFT:          '#f59e0b',
  REPLAY:         '#fbbf24',
  'VELOCITY INJ.':'#8b5cf6',
  'ALT BOMB':     '#e11d48',
  'CMD INJECT':   '#00b0ff',
  JAMMING:        '#10b981',
  SUBTLE:         '#3b82f6',
  UNKNOWN:        '#8a99a8',
};

function getColor(atk) {
  if (!atk) return '#4a6a8a';
  for (const [key, val] of Object.entries(ATTACK_COLORS)) {
    if (atk.toUpperCase().includes(key)) return val;
  }
  return '#ff1a4a';
}

function formatTime(ts) {
  try {
    return new Date(parseFloat(ts) * 1000).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function AlertHistory({ alerts = [] }) {
  const listRef = useRef(null);
  const prevLen = useRef(0);

  // Auto-scroll to newest alert
  useEffect(() => {
    if (alerts.length > prevLen.current && listRef.current) {
      listRef.current.scrollTop = 0;
    }
    prevLen.current = alerts.length;
  }, [alerts.length]);

  if (!alerts.length) {
    return (
      <div className="alert-history-empty">
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🛡️</div>
        <div style={{ color: '#00ff88', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '2px', fontSize: '0.85rem' }}>
          NO ALERTS RECORDED
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: 'ui-monospace, monospace' }}>
          All telemetry nominal — Isolation Forest + LSTM clear
        </div>
      </div>
    );
  }

  // Show newest first
  const sorted = [...alerts].reverse();

  return (
    <div className="alert-history" ref={listRef}>
      {sorted.map((alert, i) => {
        const color = getColor(alert.attack_type);
        return (
          <div key={i} className="alert-card" style={{ borderLeftColor: color }}>
            {/* Header row */}
            <div className="alert-card-header">
              <span className="alert-type-badge" style={{ color, borderColor: color }}>
                {alert.attack_type || 'ANOMALY'}
              </span>
              <span className="alert-time">{formatTime(alert.timestamp)}</span>
            </div>
            {/* Metrics row */}
            <div className="alert-metrics">
              {alert.jump_meters > 0 && (
                <span className="alert-metric">
                  <span className="metric-label">Δ POS</span>
                  <span className="metric-val" style={{ color }}>
                    {alert.jump_meters >= 1000
                      ? `${(alert.jump_meters / 1000).toFixed(2)}km`
                      : `${alert.jump_meters}m`}
                  </span>
                </span>
              )}
              {alert.alt_delta > 0 && (
                <span className="alert-metric">
                  <span className="metric-label">Δ ALT</span>
                  <span className="metric-val" style={{ color }}>
                    {parseFloat(alert.alt_delta).toFixed(1)}m
                  </span>
                </span>
              )}
              <span className="alert-metric">
                <span className="metric-label">ALT</span>
                <span className="metric-val">{parseFloat(alert.alt).toFixed(1)}m</span>
              </span>
            </div>
            {/* Reason */}
            <div className="alert-reason">{alert.reason}</div>
            {/* Source */}
            <div className="alert-source">
              ⚡ {alert.disturbance_source}
            </div>
            {/* Coords */}
            <div className="alert-coords">
              {parseFloat(alert.lat).toFixed(5)}°N, {parseFloat(alert.lon).toFixed(5)}°E
            </div>
          </div>
        );
      })}
    </div>
  );
}
