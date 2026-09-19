import {
  AlertTriangle,
  CheckCircle2,
  Navigation
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AutocompleteInput from '../components/AutocompleteInput';
import RouteMap from '../components/RouteMap';
import { findRoutes, getAreasBatch } from '../service';

export default function Dashboard() {
  // Search inputs
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [softCheck, setSoftCheck] = useState(false);
  const [kPaths, setKPaths] = useState(5);

  // Results & Path selection
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [selectedPathIndex, setSelectedPathIndex] = useState(0);

  // Real-time Polling & Rerouting
  const [isPolling, setIsPolling] = useState(false);
  const [spikeAlert, setSpikeAlert] = useState(null);
  const [rerouteCount, setRerouteCount] = useState(0);
  const [lastPollTime, setLastPollTime] = useState(null);

  // Ref to hold current state for interval closure
  const activePathRef = useRef(null);
  const searchParamsRef = useRef({ origin, destination, softCheck, kPaths });

  useEffect(() => {
    searchParamsRef.current = { origin, destination, softCheck, kPaths };
  }, [origin, destination, softCheck, kPaths]);

  const activePath = routeData?.paths?.[selectedPathIndex] || null;

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  // Execute Route Finding
  const handleSearch = async (isAutoReroute = false) => {
    if (!origin || !destination) {
      setError('Please select both Origin and Destination areas.');
      return;
    }

    setLoading(!isAutoReroute);
    setError(null);

    try {
      const data = await findRoutes({
        originId: origin.areaId,
        destinationId: destination.areaId,
        softCheck: searchParamsRef.current.softCheck,
        k: searchParamsRef.current.kPaths,
        aqiThreshold: 400,
      });

      if (!data.paths || data.paths.length === 0) {
        setError('Notice: All routes AQI has gone above 400');
        // setRouteData(null);
        // setIsPolling(false);
      } else {
        setError(null);
        setRouteData(data);
        setSelectedPathIndex(0);
        setIsPolling(true);
        if (isAutoReroute) {
          setRerouteCount((prev) => prev + 1);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to calculate route.');
      setRouteData(null);
      setIsPolling(false);
    } finally {
      setLoading(false);
    }
  };

  // Real-time 5-second polling effect
  useEffect(() => {
    if (!isPolling || !activePath) return;

    const interval = setInterval(async () => {
      const currentPath = activePathRef.current;
      if (!currentPath || !currentPath.nodes || currentPath.nodes.length === 0) return;

      setLastPollTime(new Date().toLocaleTimeString());

      try {
        // Fetch current AQI for all nodes on the active route in a SINGLE batch API call
        const nodeIds = currentPath.nodes.map((n) => n.areaId);
        const freshNodes = await getAreasBatch(nodeIds);

        // Check if any node's AQI has spiked > 400
        const spikedNode = freshNodes.find((n) => n && n.aqi > 400);

        if (spikedNode) {
          console.warn('⚠️ AQI Spike detected on active route:', spikedNode);
          setSpikeAlert({
            nodeName: spikedNode.name,
            nodeId: spikedNode.areaId,
            aqi: Math.round(spikedNode.aqi),
            timestamp: new Date().toLocaleTimeString(),
          });

          // Trigger automatic reroute
          handleSearch(true);
        } else {
          // Keep active path node AQIs updated in real time
          if (freshNodes.length > 0) {
            const freshAqiMap = new Map(freshNodes.map((fn) => [fn.areaId, fn.aqi]));
            setRouteData((prev) => {
              if (!prev || !prev.paths) return prev;
              const updatedPaths = prev.paths.map((p, pIdx) => {
                if (pIdx !== selectedPathIndex) return p;
                return {
                  ...p,
                  nodes: p.nodes.map((n) => ({
                    ...n,
                    aqi: freshAqiMap.has(n.areaId) ? freshAqiMap.get(n.areaId) : n.aqi,
                  })),
                };
              });
              return { ...prev, paths: updatedPaths };
            });
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isPolling, routeData]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            EcoRoute Planner
            <span style={{
              fontSize: '0.85rem',
              color: '#854d0e',
              background: '#fef9c3',
              border: '1px solid #fde047',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              fontWeight: 700,
            }}>
              Delhi NCR
            </span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '4px' }}>
            Multi-objective graph optimization balancing physical distance with dynamic air quality.
          </p>
        </div>

        {/* Poller Status Indicator */}
        {isPolling && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: '#ffffff',
            padding: '8px 18px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
          }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#16a34a',
              boxShadow: '0 0 10px rgba(22, 163, 74, 0.6)',
              animation: 'pulse-border 1.5s infinite',
            }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600 }}>
              Live Polling (Every 5s)
            </span>
            {lastPollTime && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                Synced: {lastPollTime}
              </span>
            )}
            {rerouteCount > 0 && (
              <span style={{
                fontSize: '0.75rem',
                color: '#c2410c',
                background: '#ffedd5',
                border: '1px solid #fed7aa',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
              }}>
                {rerouteCount} auto-reroute(s)
              </span>
            )}
          </div>
        )}
      </div>

      {/* AQI Spike Alert Banner */}
      {spikeAlert && (
        <div className="alert-pulse-danger" style={{
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 12px rgba(239, 68, 68, 0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#dc2626',
            }}>
              <AlertTriangle size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#991b1b' }}>
                AQI Spike Detected: {spikeAlert.nodeName} ({spikeAlert.nodeId})
              </div>
              <div style={{ fontSize: '0.85rem', color: '#b91c1c', marginTop: '2px' }}>
                AQI reached <b>{spikeAlert.aqi}</b> (Severe Hazard &gt; 400). Automatically rerouting traffic around contaminated sector at {spikeAlert.timestamp}...
              </div>
            </div>
          </div>
          <button
            onClick={() => setSpikeAlert(null)}
            className="btn btn-secondary btn-sm"
            style={{ background: '#ffffff', borderColor: '#fca5a5', color: '#991b1b' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Left Controls & Details | Right Map */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '420px 1fr',
        gap: '24px',
        minHeight: '720px',
      }}>
        {/* Left Sidebar: Controls and Route Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Route Config Glass Panel */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '18px', color: '#0f172a' }}>
              Plan Route
            </h2>

            {/* Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <AutocompleteInput
                label="Origin (From)"
                placeholder="Type start area (e.g. Connaught Place)..."
                value={origin}
                onSelect={(area) => setOrigin(area)}
                accentColor="#ca8a04"
              />

              <AutocompleteInput
                label="Destination (To)"
                placeholder="Type destination (e.g. Sector 18, Noida)..."
                value={destination}
                onSelect={(area) => setDestination(area)}
                accentColor="#0f172a"
              />
            </div>

            {/* Constraints & Options */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
              {/* Soft Check Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Soft AQI Check
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    {softCheck
                      ? 'Allow paths through high AQI (>400) with warning flags'
                      : 'Strictly reject any path crossing an area with AQI > 400'}
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={softCheck}
                    onChange={(e) => setSoftCheck(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              {/* K Paths Selection */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Alternative Paths (K):
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[3, 5, 6, 8].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setKPaths(num)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        border: kPaths === num ? '1px solid #ca8a04' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        background: kPaths === num ? 'linear-gradient(135deg, #facc15, #eab308)' : '#ffffff',
                        color: kPaths === num ? '#0f172a' : '#64748b',
                        boxShadow: kPaths === num ? '0 2px 8px rgba(234, 179, 8, 0.3)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={() => handleSearch(false)}
              disabled={loading || !origin || !destination}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '20px', padding: '12px' }}
            >
              {loading ? (
                <>Calculating Eco-Path...</>
              ) : (
                <>
                  <Navigation size={18} />
                  Find Optimal Route
                </>
              )}
            </button>

            {error && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                fontSize: '0.85rem',
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Active Path Stats Card */}
          {activePath && (
            <div className="glass-panel" style={{ padding: '24px', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                  Route Metrics
                </h3>
                {activePath.aqiHighFlag ? (
                  <span className="aqi-badge aqi-severe">
                    <AlertTriangle size={13} /> AQI Spike Warning
                  </span>
                ) : (
                  <span className="aqi-badge aqi-good">
                    <CheckCircle2 size={13} /> Clean Corridor
                  </span>
                )}
              </div>

              {/* Metric Highlights */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                <div className="glass-card">
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Total Distance
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                    {activePath.totalDistance.toFixed(1)} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>km</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    Shortest: {routeData.shortestDistance.toFixed(1)} km
                  </div>
                </div>

                <div className="glass-card">
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Average AQI
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ca8a04', marginTop: '4px' }}>
                    {activePath.avgAqi.toFixed(0)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    Score: {activePath.score}
                  </div>
                </div>
              </div>

              {/* Path Switcher Tabs (if k > 1) */}
              {routeData.paths.length > 1 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                    Select Alternative Route:
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {routeData.paths.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedPathIndex(idx)}
                        style={{
                          flex: 1,
                          padding: '8px 4px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: selectedPathIndex === idx ? '#fef9c3' : '#ffffff',
                          border: selectedPathIndex === idx ? '1px solid #eab308' : '1px solid var(--border-subtle)',
                          color: selectedPathIndex === idx ? '#854d0e' : 'var(--text-muted)',
                          boxShadow: selectedPathIndex === idx ? '0 2px 6px rgba(234, 179, 8, 0.2)' : 'none',
                        }}
                      >
                        Option {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Route Waypoint Steps List */}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Waypoints along path ({activePath.nodes.length} nodes):
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {activePath.nodes.map((node, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: (node.aqi || 0) > 400 ? '#fef2f2' : '#f8fafc',
                        border: `1px solid ${(node.aqi || 0) > 400 ? '#fca5a5' : '#e2e8f0'}`,
                        borderLeft: `4px solid ${(node.aqi || 0) > 400 ? '#ef4444' : '#eab308'}`,
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                          {idx + 1}.
                        </span>
                        <span style={{ color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {node.name}
                        </span>
                      </div>
                      <span style={{
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        color: (node.aqi || 0) > 400 ? '#dc2626' : (node.aqi || 0) > 200 ? '#d97706' : '#16a34a',
                      }}>
                        AQI {node.aqi != null ? Math.round(node.aqi) : 'N/A'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Area: Interactive Map */}
        <div className="glass-panel" style={{ padding: '8px', minHeight: '680px', display: 'flex', flexDirection: 'column' }}>
          <RouteMap
            path={activePath}
            origin={origin}
            destination={destination}
          />
        </div>
      </div>
    </div>
  );
}
