import { useState, useEffect, useRef } from 'react';

const ATTACK_TYPE_LABELS = {
  spike:           { label: 'GPS Spike',          color: '#3b82f6', icon: '⚡', desc: 'Instant coordinate teleportation' },
  drift:           { label: 'GPS Drift',           color: '#f59e0b', icon: '🌊', desc: 'Gradual compounding offset' },
  replay:          { label: 'Replay Attack',       color: '#fbbf24', icon: '🔁', desc: 'Frozen stale position replay' },
  velocity_inject: { label: 'Velocity Injection',  color: '#8b5cf6', icon: '💉', desc: 'Inconsistent velocity vector spoofing' },
  altitude_bomb:   { label: 'Altitude Bomb',       color: '#e11d48', icon: '💣', desc: 'Fake crash altitude to force RTL/land' },
  jamming:         { label: 'Signal Jamming',      color: '#10b981', icon: '📡', desc: 'GPS signal suppression (packet loss)' },
  cmd_inject:      { label: 'Command Injection',   color: '#00b0ff', icon: '💻', desc: 'Malicious OS command payload in telemetry' },
};

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function MissionControl({ attackState }) {
  const [selectedType, setSelectedType]   = useState('spike');
  const [duration, setDuration]           = useState(30);
  const [loading, setLoading]             = useState(false);
  const [feedback, setFeedback]           = useState(null);
  const [mlSensitivity, setMlSensitivity] = useState(10); // contamination %

  // Countdown timer display
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (attackState?.active && attackState?.duration > 0) {
      setCountdown(attackState.duration);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(timerRef.current); return 0; }
          return c - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCountdown(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [attackState?.active]);

  const showFeedback = (msg, color = '#00ff88') => {
    setFeedback({ msg, color });
    setTimeout(() => setFeedback(null), 3000);
  };

  const triggerAttack = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/attack/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedType, duration }),
      });
      if (res.ok) {
        const info = ATTACK_TYPE_LABELS[selectedType];
        showFeedback(`⚡ ${info.label} attack activated for ${duration}s`, info.color);
      } else {
        showFeedback('Request failed — is api_server.py running?', '#ff1a4a');
      }
    } catch {
      showFeedback('Cannot reach API server — start api_server.py', '#ff1a4a');
    } finally {
      setLoading(false);
    }
  };

  const stopAttack = async () => {
    setLoading(true);
    try {
      await fetch(`${API}/api/attack/stop`, { method: 'POST' });
      showFeedback('✓ Attack stopped — GPS nominal', '#00ff88');
    } catch {
      showFeedback('Cannot reach API server', '#ff1a4a');
    } finally {
      setLoading(false);
    }
  };

  const isActive = attackState?.active;
  const activeType = attackState?.type;
  const activeInfo = activeType ? ATTACK_TYPE_LABELS[activeType] : null;

  return (
    <div className="mission-control">

      {/* ── Active Attack Banner ── */}
      {isActive && activeInfo && (
        <div className="attack-active-banner" style={{ borderColor: activeInfo.color }}>
          <span style={{ fontSize: '1.4rem' }}>{activeInfo.icon}</span>
          <div>
            <div style={{ color: activeInfo.color, fontWeight: 700, letterSpacing: '2px', fontSize: '0.9rem' }}>
              {activeInfo.label.toUpperCase()} ACTIVE
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontFamily: 'ui-monospace, monospace' }}>
              {activeInfo.desc}
            </div>
          </div>
          {countdown > 0 && (
            <div className="countdown-badge" style={{ borderColor: activeInfo.color, color: activeInfo.color }}>
              {countdown}s
            </div>
          )}
        </div>
      )}

      {/* ── Attack Selector ── */}
      <div className="mc-section-label">ATTACK PAYLOADS</div>
      <div className="attack-type-grid">
        {Object.entries(ATTACK_TYPE_LABELS).map(([key, info]) => {
          if (key === 'cmd_inject') return null; // Rendered separately
          return (
            <button
              key={key}
              className={`attack-card ${selectedType === key ? 'selected' : ''} ${isActive && activeType === key ? 'active-now' : ''}`}
              style={{
                '--card-color': info.color,
                borderColor: selectedType === key ? info.color : 'var(--border-dim)',
              }}
              onClick={() => setSelectedType(key)}
            >
              <span className="attack-icon">{info.icon}</span>
              <span className="attack-label">{info.label}</span>
              <span className="attack-desc">{info.desc}</span>
            </button>
          );
        })}
      </div>

      <div className="mc-section-label" style={{ marginTop: '1.25rem', color: '#00b0ff' }}>ADVANCED ATTACKS</div>
      <div className="attack-type-grid" style={{ gridTemplateColumns: '1fr' }}>
        <button
          className={`attack-card ${selectedType === 'cmd_inject' ? 'selected' : ''} ${isActive && activeType === 'cmd_inject' ? 'active-now' : ''}`}
          style={{
            '--card-color': ATTACK_TYPE_LABELS['cmd_inject'].color,
            borderColor: selectedType === 'cmd_inject' ? ATTACK_TYPE_LABELS['cmd_inject'].color : 'var(--border-dim)',
            flexDirection: 'row',
            alignItems: 'center',
            padding: '0.85rem'
          }}
          onClick={() => setSelectedType('cmd_inject')}
        >
          <span className="attack-icon" style={{ fontSize: '1.5rem', marginRight: '0.5rem' }}>{ATTACK_TYPE_LABELS['cmd_inject'].icon}</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="attack-label" style={{ fontSize: '0.85rem' }}>{ATTACK_TYPE_LABELS['cmd_inject'].label}</span>
            <span className="attack-desc">{ATTACK_TYPE_LABELS['cmd_inject'].desc}</span>
          </div>
        </button>
      </div>

      {/* ── Duration Slider ── */}
      <div className="mc-section-label" style={{ marginTop: '1.25rem' }}>
        ATTACK DURATION
        <span className="mc-value-badge">{duration}s</span>
      </div>
      <div className="slider-row">
        <span className="slider-min">5s</span>
        <input
          type="range"
          min={5}
          max={120}
          step={5}
          value={duration}
          onChange={e => setDuration(Number(e.target.value))}
          className="mc-slider"
          style={{ '--fill': ATTACK_TYPE_LABELS[selectedType].color }}
        />
        <span className="slider-min">120s</span>
      </div>

      {/* ── ML Sensitivity (display only info) ── */}
      <div className="mc-section-label" style={{ marginTop: '1.25rem' }}>
        ML SENSITIVITY
        <span className="mc-value-badge">{mlSensitivity}%</span>
      </div>
      <div className="slider-row">
        <span className="slider-min">1%</span>
        <input
          type="range" min={1} max={30} step={1}
          value={mlSensitivity}
          onChange={e => setMlSensitivity(Number(e.target.value))}
          className="mc-slider"
          style={{ '--fill': '#00d4ff' }}
        />
        <span className="slider-min">30%</span>
      </div>
      <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontFamily: 'ui-monospace, monospace' }}>
        Contamination factor for Isolation Forest (re-train to apply)
      </p>

      {/* ── Action Buttons ── */}
      <div className="mc-actions">
        <button
          className="mc-btn trigger"
          onClick={triggerAttack}
          disabled={loading}
          style={{ '--btn-color': ATTACK_TYPE_LABELS[selectedType].color }}
        >
          <span>{ATTACK_TYPE_LABELS[selectedType].icon}</span>
          {loading ? 'SENDING...' : `LAUNCH ${ATTACK_TYPE_LABELS[selectedType].label.toUpperCase()}`}
        </button>
        <button
          className="mc-btn stop"
          onClick={stopAttack}
          disabled={loading || !isActive}
        >
          ◼ ABORT ATTACK
        </button>
      </div>

      {/* ── Feedback ── */}
      {feedback && (
        <div className="mc-feedback" style={{ color: feedback.color, borderColor: feedback.color }}>
          {feedback.msg}
        </div>
      )}

      {/* ── System Info ── */}
      <div className="mc-sys-info">
        <div className="sys-row"><span>Encryption</span><span className="sys-val cyan">AES-256-GCM</span></div>
        <div className="sys-row"><span>Key Exchange</span><span className="sys-val cyan">X25519 ECDH</span></div>
        <div className="sys-row"><span>ML Model</span><span className="sys-val cyan">Isolation Forest + LSTM</span></div>
        <div className="sys-row"><span>Comm Link</span><span className="sys-val cyan">UDP → WebSocket</span></div>
        <div className="sys-row"><span>Attack API</span><span className={`sys-val ${isActive ? 'red' : 'green'}`}>{isActive ? `ACTIVE (${activeType})` : 'STANDBY'}</span></div>
      </div>
    </div>
  );
}
