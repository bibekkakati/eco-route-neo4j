import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

function getAqiColor(aqi) {
  if (aqi == null) return '#64748b';
  if (aqi <= 100) return '#16a34a'; // Good (Green)
  if (aqi <= 200) return '#ca8a04'; // Moderate (Yellow/Gold)
  if (aqi <= 300) return '#ea580c'; // Poor (Orange)
  if (aqi <= 400) return '#dc2626'; // Very Poor (Red)
  return '#9333ea'; // Severe / Hazard (>400)
}

function getAqiLabel(aqi) {
  if (aqi == null) return 'N/A';
  if (aqi <= 100) return 'Good';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very Poor';
  return 'Hazardous (>400)';
}

export default function RouteMap({ path, origin, destination }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const lastPathSignatureRef = useRef('');

  // Initialize Map once
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([28.6139, 77.2090], 11); // Center on Delhi

      // OpenStreetMap free tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Re-position zoom control to bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Route Polyline & Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (!path || !path.nodes || path.nodes.length === 0) {
      lastPathSignatureRef.current = '';
      return;
    }

    const latLngs = path.nodes.map((n) => [n.latitude, n.longitude]);
    const pathSignature = path.nodes.map((n) => n.areaId).join('->');
    const isNewRoute = pathSignature !== lastPathSignatureRef.current;
    lastPathSignatureRef.current = pathSignature;

    // 1. Glow Polyline (warm yellow soft halo)
    const glowLine = L.polyline(latLngs, {
      color: '#fef08a',
      weight: 12,
      opacity: 0.8,
      lineCap: 'round',
      lineJoin: 'round',
    });
    layerGroup.addLayer(glowLine);

    // 2. Main Route Polyline (Primary Yellow / Gold)
    const mainLine = L.polyline(latLngs, {
      color: path.aqiHighFlag ? '#ea580c' : '#ca8a04',
      weight: 5,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: path.aqiHighFlag ? '8, 8' : undefined,
    });
    layerGroup.addLayer(mainLine);

    // 3. Render Node Markers with AQI Badges
    path.nodes.forEach((node, idx) => {
      const isOrigin = idx === 0;
      const isDestination = idx === path.nodes.length - 1;
      const aqiColor = getAqiColor(node.aqi);
      const isSpike = (node.aqi || 0) > 400;

      let markerHtml = '';

      if (isOrigin) {
        // Start Pin: Rich Yellow Gradient with AQI Tag
        markerHtml = `
          <div style="
            position: relative;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, #facc15, #eab308);
            border: 3px solid #ffffff;
            box-shadow: 0 4px 12px rgba(202, 138, 4, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            color: #0f172a;
            font-size: 14px;
          ">
            A
            <div style="
              position: absolute;
              bottom: -6px;
              right: -6px;
              background: ${aqiColor};
              color: #ffffff;
              font-size: 10px;
              font-weight: 800;
              padding: 1px 5px;
              border-radius: 999px;
              border: 1.5px solid #ffffff;
              box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            ">${node.aqi != null ? Math.round(node.aqi) : ''}</div>
          </div>
        `;
      } else if (isDestination) {
        // Destination Pin: Bold Navy/Slate with AQI Tag
        markerHtml = `
          <div style="
            position: relative;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #0f172a;
            border: 3px solid #ffffff;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            color: #ffffff;
            font-size: 14px;
          ">
            B
            <div style="
              position: absolute;
              bottom: -6px;
              right: -6px;
              background: ${aqiColor};
              color: #ffffff;
              font-size: 10px;
              font-weight: 800;
              padding: 1px 5px;
              border-radius: 999px;
              border: 1.5px solid #ffffff;
              box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            ">${node.aqi != null ? Math.round(node.aqi) : ''}</div>
          </div>
        `;
      } else {
        // Intermediate Waypoint Node with AQI Value
        markerHtml = `
          <div style="
            width: ${isSpike ? '30px' : '24px'};
            height: ${isSpike ? '30px' : '24px'};
            border-radius: 50%;
            background: ${aqiColor};
            border: 2px solid #ffffff;
            box-shadow: 0 2px 8px ${isSpike ? 'rgba(220, 38, 38, 0.8)' : 'rgba(0,0,0,0.25)'};
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            color: #ffffff;
            font-size: ${isSpike ? '11px' : '10px'};
            animation: ${isSpike ? 'pulse-border 1.2s infinite' : 'none'};
          ">${node.aqi != null ? Math.round(node.aqi) : '?'}</div>
        `;
      }

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-aqi-marker',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([node.latitude, node.longitude], { icon: customIcon });

      // Interactive Popup
      marker.bindPopup(`
        <div style="min-width: 170px; line-height: 1.4;">
          <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 4px; color: #0f172a;">
            ${node.name}
          </div>
          <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 8px;">
            ID: <b>${node.areaId}</b> &bull; [${node.latitude.toFixed(4)}, ${node.longitude.toFixed(4)}]
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 6px;">
            <span style="font-size: 0.8rem; color: #475569;">AQI Level:</span>
            <span style="
              font-size: 0.8rem;
              font-weight: 800;
              color: ${aqiColor};
              background: #f8fafc;
              padding: 2px 8px;
              border-radius: 999px;
              border: 1px solid #e2e8f0;
            ">${node.aqi != null ? Math.round(node.aqi) : 'N/A'} &bull; ${getAqiLabel(node.aqi)}</span>
          </div>
        </div>
      `);

      layerGroup.addLayer(marker);
    });

    // Only auto-fit map bounds when a new route is calculated, preserving user zoom during polling
    if (isNewRoute && latLngs.length > 0) {
      map.fitBounds(L.latLngBounds(latLngs), {
        padding: [60, 60],
        maxZoom: 15,
        animate: true,
      });
    }
  }, [path]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Map Legend Floating Overlay */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        zIndex: 400,
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(10px)',
        border: '1px solid #cbd5e1',
        borderRadius: 'var(--radius-md)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
          AQI Tiers:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', fontWeight: 600 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#16a34a' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a' }} />
            0-100 (Good)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b45309' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ca8a04' }} />
            101-200
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#c2410c' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ea580c' }} />
            201-300
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626' }} />
            301-400
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#7e22ce', fontWeight: 700 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9333ea' }} />
            400+ (Hazard)
          </span>
        </div>
      </div>
    </div>
  );
}
