import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon path issues in Vite/React
delete L.Icon.Default.prototype._getIconUrl;

// Use Esri World Imagery for realistic satellite map
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = 'Tiles &copy; Esri';

export default function LeafletMap({ flightPath = [], current, isAlert }) {
  const mapRef     = useRef(null);
  const mapObj     = useRef(null);
  const pathRef    = useRef(null);     // Polyline for normal path
  const spoofRef   = useRef(null);     // Polyline for spoofed path
  const markerRef  = useRef(null);     // Current drone marker
  const circleRef  = useRef(null);     // Pulse circle

  // ── Mount map once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mapObj.current) return;
    if (!mapRef.current) return;

    // Default center (will be overridden on first valid telemetry)
    const map = L.map(mapRef.current, {
      center: [20.5937, 78.9629], // India center
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    });

    // Dark-styled OSM tile layer
    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      maxZoom: 19,
    }).addTo(map);

    // Removed artificial hue/brightness filter so map looks realistic
    // map.getContainer().style.filter = 'hue-rotate(190deg) saturate(0.5) brightness(0.7)';

    mapObj.current = map;

    return () => {
      map.remove();
      mapObj.current = null;
    };
  }, []);

  // ── Update flight path + drone marker ──────────────────────────────────
  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;

    // Separate normal vs. spoofed points
    const normalPts = [];
    const spoofedPts = [];
    let prevLabel = 0;

    const validPts = flightPath.filter(r => r.lat && r.lon).map(r => ({
      latlng: [parseFloat(r.lat), parseFloat(r.lon)],
      label:  parseInt(r.label || 0),
    }));

    if (validPts.length === 0) return;

    // Build segment lists for coloring
    const segments = []; // [{points: [...], spoofed: bool}]
    let curSegment  = { points: [validPts[0].latlng], spoofed: validPts[0].label === 1 };

    for (let i = 1; i < validPts.length; i++) {
      const p = validPts[i];
      if (p.label !== (curSegment.spoofed ? 1 : 0)) {
        segments.push(curSegment);
        curSegment = { points: [validPts[i - 1].latlng, p.latlng], spoofed: p.label === 1 };
      } else {
        curSegment.points.push(p.latlng);
      }
    }
    segments.push(curSegment);

    // Remove old layers
    if (pathRef.current)  { map.removeLayer(pathRef.current);  pathRef.current  = null; }
    if (spoofRef.current) { map.removeLayer(spoofRef.current); spoofRef.current = null; }

    const normalGroup = L.layerGroup().addTo(map);
    const spoofGroup  = L.layerGroup().addTo(map);

    segments.forEach(seg => {
      if (seg.points.length < 2) return;
      L.polyline(seg.points, {
        color:     seg.spoofed ? '#ff1a4a' : '#00d4ff',
        weight:    seg.spoofed ? 3 : 2,
        opacity:   seg.spoofed ? 0.9 : 0.7,
        dashArray: seg.spoofed ? '6,4' : null,
      }).addTo(seg.spoofed ? spoofGroup : normalGroup);
    });

    // Add red circle markers at spoofed points
    validPts.filter(p => p.label === 1).forEach(p => {
      L.circleMarker(p.latlng, {
        radius:      5,
        color:       '#ff1a4a',
        fillColor:   '#ff1a4a',
        fillOpacity: 0.8,
        weight:      1,
      }).addTo(spoofGroup);
    });

    pathRef.current  = normalGroup;
    spoofRef.current = spoofGroup;

    // ── Drone position marker ───────────────────────────────────────────
    if (current) {
      const lat  = parseFloat(current.lat);
      const lon  = parseFloat(current.lon);
      const latlng = [lat, lon];

      if (!isNaN(lat) && !isNaN(lon)) {
        // Remove old
        if (markerRef.current)  { map.removeLayer(markerRef.current);  markerRef.current  = null; }
        if (circleRef.current)  { map.removeLayer(circleRef.current);  circleRef.current  = null; }

        // Pulse ring
        circleRef.current = L.circleMarker(latlng, {
          radius:      20,
          color:       isAlert ? '#ff1a4a' : '#00d4ff',
          fillColor:   isAlert ? '#ff1a4a' : '#00d4ff',
          fillOpacity: 0.1,
          weight:      1.5,
          opacity:     0.5,
          className:   'drone-pulse-ring',
        }).addTo(map);

        // Drone dot
        markerRef.current = L.circleMarker(latlng, {
          radius:      8,
          color:       '#fff',
          fillColor:   isAlert ? '#ff1a4a' : '#00d4ff',
          fillOpacity: 1,
          weight:      2,
        }).bindTooltip(
          `<b>DRONE-01</b><br/>
           Lat: ${lat.toFixed(6)}<br/>
           Lon: ${lon.toFixed(6)}<br/>
           Alt: ${parseFloat(current.alt).toFixed(1)}m<br/>
           Status: <b style="color:${isAlert ? '#ff1a4a' : '#00ff88'}">${isAlert ? '⚠ SPOOFED' : '✓ NOMINAL'}</b>`,
          { permanent: false, direction: 'top', className: 'drone-tooltip' }
        ).addTo(map);

        // Smoothly pan map to follow drone
        map.panTo(latlng, { animate: true, duration: 1.0 });
      }
    }
  }, [flightPath, current, isAlert]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '380px', position: 'relative' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '380px' }} />
      {/* Tactical overlay badge */}
      <div style={{
        position: 'absolute', bottom: 10, left: 10, zIndex: 1000,
        fontFamily: 'Share Tech Mono, monospace', fontSize: '0.65rem',
        background: 'rgba(2,9,18,0.9)', border: '1px solid rgba(0,212,255,0.2)',
        color: '#00d4ff', padding: '0.25rem 0.5rem', borderRadius: '2px',
        letterSpacing: '1px',
      }}>
        {current
          ? `${parseFloat(current.lat).toFixed(5)}°N  ${parseFloat(current.lon).toFixed(5)}°E`
          : 'Awaiting GPS lock...'}
      </div>
      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 1000,
        fontFamily: 'Share Tech Mono, monospace', fontSize: '0.65rem',
        background: 'rgba(2,9,18,0.9)', border: '1px solid rgba(0,212,255,0.2)',
        color: isAlert ? '#ff1a4a' : '#4a6a8a', padding: '0.25rem 0.5rem',
        borderRadius: '2px', letterSpacing: '1px',
      }}>
        {isAlert ? '⚠ SPOOFED TRAJECTORY' : '● LIVE GEOGRAPHIC TRACK'}
      </div>
    </div>
  );
}
