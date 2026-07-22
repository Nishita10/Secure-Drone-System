import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import LeafletMap from './LeafletMap';
import AnalyticsPanel from './AnalyticsPanel';
import AlertHistory from './AlertHistory';
import MissionControl from './MissionControl';
import './index.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Drone SVG ──────────────────────────────────────────────────────────────
function DroneSVG({ color = '#00d4ff', size = 90 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <rect x="40" y="40" width="20" height="20" rx="4" fill={color} opacity="0.9"/>
      <line x1="50" y1="50" x2="18" y2="18" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <line x1="50" y1="50" x2="82" y2="18" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <line x1="50" y1="50" x2="18" y2="82" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <line x1="50" y1="50" x2="82" y2="82" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <ellipse cx="15" cy="15" rx="13" ry="5" stroke={color} strokeWidth="1.5" opacity="0.7"/>
      <ellipse cx="85" cy="15" rx="13" ry="5" stroke={color} strokeWidth="1.5" opacity="0.7"/>
      <ellipse cx="15" cy="85" rx="13" ry="5" stroke={color} strokeWidth="1.5" opacity="0.7"/>
      <ellipse cx="85" cy="85" rx="13" ry="5" stroke={color} strokeWidth="1.5" opacity="0.7"/>
      <circle cx="15" cy="15" r="4" fill={color}/>
      <circle cx="85" cy="15" r="4" fill={color}/>
      <circle cx="15" cy="85" r="4" fill={color}/>
      <circle cx="85" cy="85" r="4" fill={color}/>
      <circle cx="50" cy="50" r="5" fill="#fff" opacity="0.6"/>
    </svg>
  );
}

// ── Nav Item ───────────────────────────────────────────────────────────────
function NavItem({ id, icon, label, active, onClick, alertCount }) {
  return (
    <button
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={() => onClick(id)}
      title={label}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {alertCount > 0 && <span className="nav-badge">{alertCount > 99 ? '99+' : alertCount}</span>}
    </button>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState('dashboard');
  const [data, setData]         = useState(null);
  const [series, setSeries]     = useState([]);
  const [connected, setConnected]   = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [clock, setClock]       = useState('');
  const [downloading, setDownloading] = useState(false);
  const [notified, setNotified] = useState(false);  // browser notification sent?
  const socketRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toUTCString().slice(17, 25) + ' UTC');
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // ── WebSocket ────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(API, { transports: ['websocket', 'polling'], reconnectionDelay: 1000 });
    socketRef.current = socket;

    socket.on('connect', () => {
      setWsConnected(true);
      setConnected(true);
    });
    socket.on('disconnect', () => {
      setWsConnected(false);
      setConnected(false);
    });

    socket.on('telemetry_update', payload => {
      if (payload?.status === 'success' || payload?.latest) {
        setData(payload);
        setConnected(true);
        // Append to series (keep last 200)
        setSeries(prev => {
          const next = [...prev, ...(payload.data || []).slice(-5)];
          return next.slice(-200);
        });
      }
    });

    // Cleanup
    return () => socket.disconnect();
  }, []);

  // ── REST fallback polling if WebSocket not connected ─────────────────────
  useEffect(() => {
    if (wsConnected) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/telemetry`);
        if (res.ok) {
          const json = await res.json();
          if (json.status === 'success') {
            setData(json);
            setConnected(true);
            setSeries(prev => {
              const next = [...prev, ...(json.data || []).slice(-5)];
              return next.slice(-200);
            });
          }
        }
      } catch { setConnected(false); }
    };
    const t = setInterval(poll, 1000);
    return () => clearInterval(t);
  }, [wsConnected]);

  // ── Also load timeline series from dedicated endpoint ────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/stats/timeline?limit=200`);
        if (res.ok) {
          const json = await res.json();
          if (json.status === 'success') setSeries(json.series || []);
        }
      } catch {}
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  // ── Browser notification + audio alert ───────────────────────────────────
  const playAlert = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }, []);

  useEffect(() => {
    const latest = data?.latest;
    const isAlert = latest ? parseInt(latest.label) === 1 : false;
    if (isAlert && !notified) {
      playAlert();
      if ('Notification' in window) {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            new Notification('🚨 Drone Security Breach', {
              body: `Attack: ${data?.latest_alert?.attack_type || 'GPS Anomaly'} detected`,
              icon: '/vite.svg',
            });
          }
        });
      }
      setNotified(true);
    } else if (!isAlert) {
      setNotified(false);
    }
  }, [data?.latest?.label]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API}/api/report`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `drone_mission_report_${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Report download failed. Make sure api_server.py is running.'); }
    finally { setDownloading(false); }
  };

  // ── Derived state ────────────────────────────────────────────────────────
  const latest      = data?.latest;
  const latestAlert = data?.latest_alert;
  const stats       = data?.stats;
  const alerts      = data?.alerts || [];
  const attackState = data?.attack_state || {};
  const attackCounts = data?.attack_counts || {};
  const isAlert     = latest ? parseInt(latest.label) === 1 : false;
  const droneColor  = isAlert ? '#ff1a4a' : '#00d4ff';
  const threatPct   = stats ? Math.min(100, (stats.anomalies_detected / Math.max(1, stats.total_packets)) * 800) : 0;
  const threatColor = threatPct > 40 ? '#ff1a4a' : threatPct > 10 ? '#ff6600' : '#00ff88';

  // ── Tab content ──────────────────────────────────────────────────────────
  const renderDashboard = () => (
    <>
      {/* Threat Banner */}
      <div className={`threat-banner ${isAlert ? 'alert' : 'secure'}`}>
        {isAlert ? (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 20h20L12 2z" stroke="#ff1a4a" strokeWidth="2" fill="rgba(255,26,74,0.15)"/>
              <line x1="12" y1="9" x2="12" y2="14" stroke="#ff1a4a" strokeWidth="2"/>
              <circle cx="12" cy="17" r="1" fill="#ff1a4a"/>
            </svg>
            <div className="reason-box">
              <span className="reason-type">🚨 ML BREACH — {latestAlert?.attack_type || 'UNKNOWN'} ATTACK</span>
              <span className="reason-detail">{latestAlert?.reason || 'Ensemble ML detected an impossible spatial event.'}</span>
              <span className="reason-source">⚡ SOURCE: {latestAlert?.disturbance_source || 'Unknown RF interference'}{latestAlert?.jump_meters ? ` | Δ${latestAlert.jump_meters}m` : ''}</span>
            </div>
          </>
        ) : (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V6L12 2z" stroke="#00ff88" strokeWidth="1.5" fill="rgba(0,255,136,0.08)"/>
              <polyline points="8,12 11,15 16,9" stroke="#00ff88" strokeWidth="2"/>
            </svg>
            <div className="reason-box">
              <span className="reason-type">All Systems Nominal — Isolation Forest + LSTM Clear</span>
              <span className="reason-detail">
                AES-256-GCM &nbsp;|&nbsp; X25519 ECDH &nbsp;|&nbsp;
                Packets: {stats?.total_packets ?? '--'} &nbsp;|&nbsp; Anomalies: {stats?.anomalies_detected ?? 0}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 3-column main grid */}
      <div className="main-grid">
        {/* Left: Vehicle Status */}
        <div className="panel" style={{ display:'flex', flexDirection:'column' }}>
          <div className="panel-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#4a6a8a" strokeWidth="1.5"/>
              <line x1="12" y1="2" x2="12" y2="22" stroke="#4a6a8a" strokeWidth="1"/>
              <line x1="2" y1="12" x2="22" y2="12" stroke="#4a6a8a" strokeWidth="1"/>
            </svg>
            Vehicle Status
          </div>
          <div className="drone-3d-stage">
            <div className="drone-ring drone-ring-1"/>
            <div className="drone-ring drone-ring-2"/>
            <div className="drone-ring drone-ring-3"/>
            <div className={`drone-svg-wrap ${isAlert ? 'alert' : ''}`}>
              <DroneSVG color={droneColor} size={100}/>
            </div>
          </div>
          <div className="drone-stats">
            {[
              { label:'Latitude',    val: latest ? parseFloat(latest.lat).toFixed(6) : '---' },
              { label:'Longitude',   val: latest ? parseFloat(latest.lon).toFixed(6) : '---' },
              { label:'Altitude',    val: latest ? `${parseFloat(latest.alt).toFixed(1)} m` : '--- m' },
              { label:'Vel X/Y/Z',  val: latest ? `${latest.vel_x}/${latest.vel_y}/${latest.vel_z}` : '---' },
              { label:'AI Status',  val: isAlert ? 'BREACH' : 'NOMINAL' },
              { label:'Threat Lvl', val: stats?.threat_level ?? 'SECURE' },
            ].map(({ label, val }) => (
              <div className="drone-stat" key={label}>
                <div className="drone-stat-label">{label}</div>
                <div className={`drone-stat-value ${isAlert ? 'alert-val' : ''}`}
                     style={{ fontFamily:'Share Tech Mono,monospace', fontSize:'0.82rem' }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Leaflet Map */}
        <div className="panel map-container" style={{ display:'flex', flexDirection:'column' }}>
          <div className="panel-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <polygon points="3,3 9,21 12,12 21,9" stroke="#4a6a8a" strokeWidth="1.5" fill="none"/>
            </svg>
            Geographic Positioning Display
            <span style={{ marginLeft:'auto', fontSize:'0.65rem',
              color: isAlert ? 'var(--accent-red)' : 'var(--accent-cyan)' }}>
              {isAlert ? '⚠ SPOOFED' : '● LIVE'}
            </span>
          </div>
          <div style={{ flex:1, minHeight:'380px', position:'relative' }}>
            <LeafletMap
              flightPath={data?.flight_path ?? []}
              current={latest}
              isAlert={isAlert}
            />
          </div>
        </div>

        {/* Right: Stats */}
        <div className="panel stats-panel">
          <div className="panel-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" stroke="#4a6a8a" strokeWidth="1.5"/>
            </svg>
            Mission Analytics
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Packets</div>
            <div className="stat-number cyan">{stats?.total_packets ?? '0'}</div>
            <div className="stat-sub">Verified & Decrypted via AES-GCM</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Anomalies (ML Ensemble)</div>
            <div className={`stat-number ${(stats?.anomalies_detected ?? 0) > 0 ? 'red' : 'green'}`}>
              {stats?.anomalies_detected ?? '0'}
            </div>
            <div className="stat-sub">Isolation Forest + LSTM</div>
            <div className="threat-level-bar">
              <div className="threat-level-fill" style={{ width:`${threatPct}%`, background: threatColor }}/>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Threat Classification</div>
            <div className={`stat-number ${stats?.threat_level === 'HIGH' ? 'red' : stats?.threat_level === 'MEDIUM' ? '' : 'green'}`}
                 style={stats?.threat_level === 'MEDIUM' ? { color:'#ff6600' } : {}}>
              {stats?.threat_level ?? 'SECURE'}
            </div>
            <div className="stat-sub">Composite Risk Assessment</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Last Attack Vector</div>
            <div style={{ fontFamily:'Share Tech Mono,monospace', fontSize:'0.78rem',
                          color: latestAlert ? 'var(--accent-red)' : 'var(--text-muted)',
                          marginTop:'0.3rem', lineHeight:1.5 }}>
              {latestAlert ? (
                <>
                  <span style={{ display:'block', color: 'var(--accent-orange)', fontWeight:'bold' }}>
                    {latestAlert.attack_type}
                  </span>
                  <span style={{ display:'block', fontSize:'0.7rem', opacity:0.8 }}>
                    Δ {latestAlert.jump_meters}m displaced
                  </span>
                  <span style={{ display:'block', fontSize:'0.7rem', opacity:0.7, marginTop:'0.2rem' }}>
                    {latestAlert.disturbance_source}
                  </span>
                </>
              ) : <span>No attacks recorded</span>}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">WebSocket Link</div>
            <div className={`stat-number ${wsConnected ? 'green' : 'red'}`} style={{ fontSize:'1.2rem' }}>
              {wsConnected ? '● LIVE PUSH' : '◌ POLLING'}
            </div>
            <div className="stat-sub">{wsConnected ? 'Real-time SocketIO' : 'REST fallback (1s)'}</div>
          </div>
        </div>
      </div>

      {/* Live Packet Log */}
      <div className="panel" style={{ marginTop:0 }}>
        <div className="panel-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="#4a6a8a" strokeWidth="1.5"/>
            <line x1="3" y1="9" x2="21" y2="9" stroke="#4a6a8a" strokeWidth="1"/>
            <line x1="9" y1="4" x2="9" y2="20" stroke="#4a6a8a" strokeWidth="1"/>
          </svg>
          Live Packet Log (Last 10)
          {isAlert && (
            <span style={{ marginLeft:'auto', color:'var(--accent-red)', fontSize:'0.65rem', animation:'blink 0.8s infinite' }}>
              ⚠ ANOMALY STREAM ACTIVE
            </span>
          )}
        </div>
        <div className="log-table">
          <div className="log-row header">
            <span>TIME</span><span>LATITUDE</span><span>LONGITUDE</span><span>ALT(m)</span><span>ATTACK</span><span>STATUS</span>
          </div>
          {(data?.data ?? []).slice(-10).reverse().map((row, i) => {
            const bad = parseInt(row.label) === 1;
            const t   = new Date(parseFloat(row.timestamp) * 1000);
            return (
              <div key={i} className={`log-row ${bad ? 'anomaly' : 'normal'}`}>
                <span>{t.toLocaleTimeString()}</span>
                <span>{parseFloat(row.lat).toFixed(6)}</span>
                <span>{parseFloat(row.lon).toFixed(6)}</span>
                <span>{parseFloat(row.alt).toFixed(1)}</span>
                <span style={{ color: bad ? 'var(--accent-orange)' : 'var(--text-muted)', fontSize:'0.65rem' }}>
                  {row.attack_type || '—'}
                </span>
                <span>
                  <div className={`log-tag ${bad ? 'bad' : 'ok'}`}>
                    {bad ? 'SPOOFED' : 'VERIFIED'}
                  </div>
                </span>
              </div>
            );
          })}
          {!data && (
            <div style={{ padding:'1rem', color:'var(--text-muted)', fontFamily:'Share Tech Mono,monospace', fontSize:'0.75rem' }}>
              Waiting for WebSocket connection...
            </div>
          )}
        </div>
      </div>
    </>
  );

  const renderAnalytics = () => (
    <AnalyticsPanel series={series} attackCounts={attackCounts} />
  );

  const renderMission = () => (
    <div className="mission-grid">
      <div className="panel">
        <div className="panel-header">🎛️ &nbsp; MISSION CONTROL</div>
        <MissionControl attackState={attackState} />
      </div>
      <div className="panel">
        <div className="panel-header">🚨 &nbsp; ALERT HISTORY ({alerts.length})</div>
        <AlertHistory alerts={alerts} />
      </div>
    </div>
  );

  const renderAlerts = () => (
    <div className="panel" style={{ minHeight:'600px' }}>
      <div className="panel-header">🚨 &nbsp; FULL ALERT LOG ({alerts.length} incidents)</div>
      <AlertHistory alerts={alerts} />
    </div>
  );

  return (
    <div className="app-shell">
      {/* ── SIDEBAR ── */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <polygon points="14,2 26,22 2,22" stroke="#00d4ff" strokeWidth="1.5" fill="none" opacity="0.8"/>
            <circle cx="14" cy="15" r="4" fill="#00d4ff"/>
          </svg>
        </div>
        <div className="nav-items">
          <NavItem id="dashboard"  icon="📡" label="Dashboard"    active={tab==='dashboard'}  onClick={setTab} />
          <NavItem id="analytics"  icon="📈" label="Analytics"    active={tab==='analytics'}  onClick={setTab} />
          <NavItem id="mission"    icon="🎛️" label="Mission Ctrl" active={tab==='mission'}    onClick={setTab} alertCount={attackState?.active ? 1 : 0} />
          <NavItem id="alerts"     icon="🚨" label="Alerts"       active={tab==='alerts'}     onClick={setTab} alertCount={alerts.length} />
        </div>
        <div className="sidebar-status">
          <div className={`sidebar-dot ${connected ? 'online' : 'offline'}`}/>
          <span>{connected ? 'LIVE' : 'OFFLINE'}</span>
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <div className="main-content">
        {/* Header */}
        <header className="header">
          <div className="header-logo">
            <div>
              <div className="header-title">Secure Drone Command Pipeline</div>
              <div className="header-sub">ML Ensemble • AES-256-GCM • X25519 ECDH • SocketIO Real-Time</div>
            </div>
          </div>
          <div className="header-status">
            <div className={`status-pill ${connected ? 'online' : 'offline'}`}>
              <div className="status-dot"/>
              {wsConnected ? 'WS LIVE' : connected ? 'REST OK' : 'OFFLINE'}
            </div>
            <div className="status-pill enc">
              <div className="status-dot"/>
              AES-GCM ACTIVE
            </div>
            {isAlert && (
              <div className="status-pill" style={{ borderColor:'rgba(255,26,74,0.6)', color:'#ff1a4a', background:'rgba(255,26,74,0.08)' }}>
                <div className="status-dot" style={{ background:'#ff1a4a', boxShadow:'0 0 6px #ff1a4a' }}/>
                BREACH
              </div>
            )}
            <span className="clock-display">{clock}</span>
            <button className="download-btn" onClick={handleDownload} disabled={downloading}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2v14M5 9l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="2"/>
              </svg>
              {downloading ? 'Generating...' : 'Report'}
            </button>
          </div>
        </header>

        {/* Tab Content */}
        <div className="tab-content">
          {tab === 'dashboard' && renderDashboard()}
          {tab === 'analytics' && renderAnalytics()}
          {tab === 'mission'   && renderMission()}
          {tab === 'alerts'    && renderAlerts()}
        </div>

        {/* Footer */}
        <footer className="footer">
          <span>SECURE DRONE v2.0 — Isolation Forest + LSTM | AES-256-GCM + ECDH | SocketIO</span>
          <span className="clock-display">{clock}</span>
        </footer>
      </div>
    </div>
  );
}
