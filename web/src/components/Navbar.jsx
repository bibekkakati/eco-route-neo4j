import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Navigation, CheckCircle2, AlertCircle } from 'lucide-react';
import { getHealth } from '../service';

export default function Navbar() {
  const [serverOnline, setServerOnline] = useState(null);

  useEffect(() => {
    async function init() {
      try {
        const health = await getHealth();
        setServerOnline(health.status === 'ok');
      } catch (e) {
        setServerOnline(false);
      }
    }
    init();
  }, []);

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 32px',
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
    }}>
      {/* Brand Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #facc15, #eab308)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(234, 179, 8, 0.4)',
          color: '#0f172a',
        }}>
          <Navigation size={22} color="#0f172a" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
              EcoRoute
            </span>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(234, 179, 8, 0.18)',
              color: '#ca8a04',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              border: '1px solid rgba(234, 179, 8, 0.4)',
            }}>
              NCR Live
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, fontWeight: 500 }}>
            Intelligent Low-AQI Logistics
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <NavLink
          to="/dashboard"
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 18px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.9rem',
            fontWeight: 700,
            textDecoration: 'none',
            color: isActive ? '#0f172a' : '#64748b',
            background: isActive ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
            border: isActive ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid transparent',
            transition: 'all 0.2s ease',
          })}
        >
          <Navigation size={16} color="#ca8a04" />
          Route Planner
        </NavLink>
      </nav>

      {/* Status Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Live Sync Worker Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: 'var(--radius-full)',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          fontSize: '0.8rem',
          fontWeight: 600,
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#16a34a',
            boxShadow: '0 0 8px rgba(22, 163, 74, 0.5)',
          }} />
          <span style={{ color: '#475569' }}>AQI Sync Worker (30s)</span>
        </div>

        {/* Server Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.8rem',
          fontWeight: 600,
          color: serverOnline ? '#16a34a' : '#dc2626',
        }}>
          {serverOnline ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{serverOnline ? 'Backend 3000' : 'Disconnected'}</span>
        </div>
      </div>
    </header>
  );
}
