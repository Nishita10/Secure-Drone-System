import { useRef, useEffect } from 'react';

const TRAIL_COLOR = 'rgba(0, 212, 255, 0.6)';
const SPOOF_COLOR = 'rgba(255, 26, 74, 0.8)';
const DRONE_COLOR = '#00d4ff';

export default function TacticalMap({ flightPath = [], current, isAlert }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !flightPath.length) return;
    const ctx = canvas.getContext('2d');

    // Set canvas internal resolution
    const W = canvas.offsetWidth || 600;
    const H = canvas.offsetHeight || 380;
    canvas.width = W;
    canvas.height = H;

    // Find bounding box of all coords
    const validPts = flightPath.filter(r => r.lat && r.lon).map(r => ({
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      label: parseInt(r.label || 0),
    }));

    if (!validPts.length) return;

    let minLat = Math.min(...validPts.map(p => p.lat));
    let maxLat = Math.max(...validPts.map(p => p.lat));
    let minLon = Math.min(...validPts.map(p => p.lon));
    let maxLon = Math.max(...validPts.map(p => p.lon));

    // Add margin
    const padFrac = 0.15;
    const latSpan = (maxLat - minLat) || 0.001;
    const lonSpan = (maxLon - minLon) || 0.001;
    minLat -= latSpan * padFrac;
    maxLat += latSpan * padFrac;
    minLon -= lonSpan * padFrac;
    maxLon += lonSpan * padFrac;

    const toX = (lon) => ((lon - minLon) / (maxLon - minLon)) * (W - 40) + 20;
    const toY = (lat) => H - (((lat - minLat) / (maxLat - minLat)) * (H - 40) + 20);

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#020912';
    ctx.fillRect(0, 0, W, H);

    // Draw grid
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.05)';
    ctx.lineWidth = 1;
    const GRID = 8;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * (W / GRID), 0);
      ctx.lineTo(i * (W / GRID), H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * (H / GRID));
      ctx.lineTo(W, i * (H / GRID));
      ctx.stroke();
    }

    // Draw range rings from first point
    if (validPts.length > 0) {
      const cx = toX(validPts[0].lon);
      const cy = toY(validPts[0].lat);
      [40, 80, 130].forEach(r => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,200,255,0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // Draw flight path trail
    if (validPts.length > 1) {
      for (let i = 1; i < validPts.length; i++) {
        const prev = validPts[i - 1];
        const curr = validPts[i];
        ctx.beginPath();
        ctx.moveTo(toX(prev.lon), toY(prev.lat));
        ctx.lineTo(toX(curr.lon), toY(curr.lat));
        ctx.strokeStyle = curr.label === 1 ? SPOOF_COLOR : TRAIL_COLOR;
        ctx.lineWidth = curr.label === 1 ? 2 : 1.5;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Draw spoof points
    validPts.filter(p => p.label === 1).forEach(p => {
      const x = toX(p.lon);
      const y = toY(p.lat);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = SPOOF_COLOR;
      ctx.fill();
      // Burst ring
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,26,74,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Draw current drone position
    if (current) {
      const dx = toX(parseFloat(current.lon));
      const dy = toY(parseFloat(current.lat));
      const color = isAlert ? '#ff1a4a' : DRONE_COLOR;

      // Sonar rings
      for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        ctx.arc(dx, dy, r * 18, 0, Math.PI * 2);
        ctx.strokeStyle = isAlert ? `rgba(255,26,74,${0.15 / r})` : `rgba(0,212,255,${0.15 / r})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Cross-hair
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(dx - 24, dy); ctx.lineTo(dx - 8, dy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx + 8, dy); ctx.lineTo(dx + 24, dy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx, dy - 24); ctx.lineTo(dx, dy - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx, dy + 8); ctx.lineTo(dx, dy + 24); ctx.stroke();
      ctx.globalAlpha = 1;

      // Drone dot
      ctx.beginPath();
      ctx.arc(dx, dy, 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = color;
      ctx.font = '10px Share Tech Mono, monospace';
      ctx.fillText('DRONE-01', dx + 10, dy - 10);
    }

  }, [flightPath, current, isAlert]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', minHeight: '380px' }}
    />
  );
}
