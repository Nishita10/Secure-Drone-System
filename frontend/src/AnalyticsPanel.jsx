import {
  LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

const COLORS = {
  normal:   '#00d4ff',
  anomaly:  '#ff1a4a',
  spike:    '#ff1a4a',
  drift:    '#ff6600',
  replay:   '#ffe066',
  velocity: '#8b5cf6',
  altitude: '#ff4488',
  subtle:   '#00ff88',
};

const chartStyle = {
  fontSize: '0.65rem',
  fontFamily: 'Share Tech Mono, monospace',
};

const tooltipStyle = {
  background: 'rgba(2,9,18,0.95)',
  border: '1px solid rgba(0,212,255,0.25)',
  borderRadius: '4px',
  color: '#ddeeff',
  fontFamily: 'Share Tech Mono, monospace',
  fontSize: '0.7rem',
};

function CustomTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle}>
      <p style={{ color: '#4a6a8a', marginBottom: '4px' }}>
        {typeof label === 'number' ? new Date(label * 1000).toLocaleTimeString() : label}
      </p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <b>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</b>{unit || ''}
        </p>
      ))}
    </div>
  );
}

// ── Chart 1: Altitude Timeline ─────────────────────────────────────────────

function AltitudeChart({ series }) {
  if (!series || !series.length) {
    return <div className="chart-empty">No telemetry data yet — start drone_node.py</div>;
  }
  const data = series.map(p => ({
    time:    p.time,
    alt:     Math.round(parseFloat(p.alt) * 100) / 100,
    anomaly: parseInt(p.label) === 1 ? parseFloat(p.alt) : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#00d4ff" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="anomalyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ff1a4a" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#ff1a4a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.06)" />
        <XAxis
          dataKey="time"
          tick={{ ...chartStyle, fill: '#4a6a8a' }}
          tickFormatter={v => new Date(v * 1000).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
          tickLine={false}
          axisLine={{ stroke: 'rgba(0,200,255,0.1)' }}
        />
        <YAxis
          tick={{ ...chartStyle, fill: '#4a6a8a' }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(0,200,255,0.1)' }}
          unit="m"
        />
        <Tooltip content={<CustomTooltip unit="m" />} />
        <Area type="monotone" dataKey="alt" stroke="#00d4ff" strokeWidth={2}
              fill="url(#altGrad)" dot={false} name="Altitude" />
        <Area type="monotone" dataKey="anomaly" stroke="#ff1a4a" strokeWidth={0}
              fill="url(#anomalyGrad)" dot={{ r: 3, fill: '#ff1a4a' }} name="⚠ Anomaly" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Chart 2: Velocity Magnitude Timeline ───────────────────────────────────

function VelocityChart({ series }) {
  if (!series || !series.length) {
    return <div className="chart-empty">No telemetry data yet.</div>;
  }
  const data = series.map(p => {
    const vx = parseFloat(p.vel_x || 0);
    const vy = parseFloat(p.vel_y || 0);
    const vz = parseFloat(p.vel_z || 0);
    return {
      time:   p.time,
      speed:  Math.round(Math.sqrt(vx*vx + vy*vy + vz*vz) * 100) / 100,
      label:  parseInt(p.label),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.06)" />
        <XAxis
          dataKey="time"
          tick={{ ...chartStyle, fill: '#4a6a8a' }}
          tickFormatter={v => new Date(v * 1000).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
          tickLine={false}
          axisLine={{ stroke: 'rgba(0,200,255,0.1)' }}
        />
        <YAxis
          tick={{ ...chartStyle, fill: '#4a6a8a' }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(0,200,255,0.1)' }}
          unit="m/s"
        />
        <Tooltip content={<CustomTooltip unit=" m/s" />} />
        <Line type="monotone" dataKey="speed" stroke="#00ff88" strokeWidth={2}
              dot={false} name="Speed" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Chart 3: Attack Type Distribution ─────────────────────────────────────

const PIE_COLORS = ['#ff1a4a', '#ff6600', '#ffe066', '#8b5cf6', '#ff4488', '#00d4ff'];

function AttackPieChart({ attackCounts }) {
  const entries = Object.entries(attackCounts || {});
  if (!entries.length) {
    return (
      <div className="chart-empty" style={{ fontSize: '0.75rem', color: '#00ff88' }}>
        ✓ No attacks detected — all clear
      </div>
    );
  }
  const data = entries.map(([name, value]) => ({ name, value }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={3}
          dataKey="value"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={{ stroke: 'rgba(0,200,255,0.2)' }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}
                  stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0];
            return (
              <div style={tooltipStyle}>
                <p style={{ color: d.payload.fill }}>{d.name}</p>
                <p style={{ color: '#ddeeff' }}>Incidents: <b>{d.value}</b></p>
              </div>
            );
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Chart 4: Anomaly Count per Time Bucket ─────────────────────────────────

function AnomalyBarChart({ series }) {
  if (!series || series.length < 2) {
    return <div className="chart-empty">Not enough data for buckets.</div>;
  }
  // Bucket into 10-second bins
  const BUCKET = 10;
  const buckets = {};
  series.forEach(p => {
    const key = Math.floor(parseFloat(p.time) / BUCKET) * BUCKET;
    if (!buckets[key]) buckets[key] = { time: key, anomalies: 0, total: 0 };
    buckets[key].total++;
    if (parseInt(p.label) === 1) buckets[key].anomalies++;
  });
  const data = Object.values(buckets).sort((a, b) => a.time - b.time).slice(-30);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.06)" />
        <XAxis
          dataKey="time"
          tick={{ ...chartStyle, fill: '#4a6a8a' }}
          tickFormatter={v => new Date(v * 1000).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
          tickLine={false}
          axisLine={{ stroke: 'rgba(0,200,255,0.1)' }}
        />
        <YAxis
          tick={{ ...chartStyle, fill: '#4a6a8a' }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(0,200,255,0.1)' }}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="total"     name="Total"     fill="rgba(0,212,255,0.15)" radius={[2,2,0,0]} />
        <Bar dataKey="anomalies" name="Anomalies" fill="#ff1a4a"              radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Panel Header ───────────────────────────────────────────────────────────

function ChartHeader({ icon, title, badge }) {
  return (
    <div className="panel-header" style={{ justifyContent: 'space-between' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {icon} {title}
      </span>
      {badge && <span className="chart-badge">{badge}</span>}
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────────────────────

export default function AnalyticsPanel({ series, attackCounts }) {
  return (
    <div className="analytics-grid">
      {/* Altitude Timeline */}
      <div className="panel analytics-card">
        <ChartHeader icon="📈" title="ALTITUDE TIMELINE" badge="AGL (m)" />
        <div style={{ padding: '0.5rem 1rem 1rem' }}>
          <AltitudeChart series={series} />
        </div>
      </div>

      {/* Velocity */}
      <div className="panel analytics-card">
        <ChartHeader icon="💨" title="SPEED PROFILE" badge="m/s" />
        <div style={{ padding: '0.5rem 1rem 1rem' }}>
          <VelocityChart series={series} />
        </div>
      </div>

      {/* Attack distribution */}
      <div className="panel analytics-card">
        <ChartHeader icon="🎯" title="ATTACK DISTRIBUTION" badge="All time" />
        <div style={{ padding: '0.5rem 1rem 1rem' }}>
          <AttackPieChart attackCounts={attackCounts} />
        </div>
      </div>

      {/* Anomaly frequency */}
      <div className="panel analytics-card">
        <ChartHeader icon="⚡" title="ANOMALY FREQUENCY" badge="10s buckets" />
        <div style={{ padding: '0.5rem 1rem 1rem' }}>
          <AnomalyBarChart series={series} />
        </div>
      </div>
    </div>
  );
}
