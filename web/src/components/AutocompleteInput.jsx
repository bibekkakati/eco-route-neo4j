import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, X, Loader2 } from 'lucide-react';
import { searchAreas } from '../service';

export default function AutocompleteInput({
  label,
  placeholder,
  value,
  onChange,
  onSelect,
  icon: Icon = MapPin,
  accentColor = '#ca8a04',
}) {
  const [query, setQuery] = useState(value?.name || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef(null);

  // Sync external value changes
  useEffect(() => {
    if (value?.name) {
      setQuery(value.name);
    } else if (!value) {
      setQuery('');
    }
  }, [value]);

  // Debounced search query
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Don't search if query matches currently selected value
    if (value && value.name === query) {
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchAreas(query, 8);
        setResults(res);
        setIsOpen(res.length > 0);
      } catch (err) {
        console.error('Error in area autocomplete:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, value]);

  // Handle clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item) => {
    setQuery(item.name);
    setIsOpen(false);
    onSelect(item);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    onSelect(null);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: '#475569',
          marginBottom: '6px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {label}
        </label>
      )}

      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
      }}>
        {/* Leading Icon */}
        <div style={{
          position: 'absolute',
          left: '14px',
          color: accentColor,
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none',
        }}>
          <Icon size={18} />
        </div>

        {/* Input */}
        <input
          type="text"
          className="input-field"
          value={query}
          placeholder={placeholder || 'Search area or neighborhood...'}
          onChange={(e) => {
            setQuery(e.target.value);
            if (onChange) onChange(e.target.value);
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          style={{
            paddingLeft: '40px',
            paddingRight: query ? '64px' : '36px',
            background: '#ffffff',
            borderColor: isOpen ? '#eab308' : '#cbd5e1',
          }}
        />

        {/* Loading / Clear Controls */}
        <div style={{
          position: 'absolute',
          right: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          {loading && (
            <Loader2 size={16} color="#ca8a04" style={{ animation: 'spin 1s linear infinite' }} />
          )}
          {query && !loading && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown List */}
      {isOpen && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          zIndex: 50,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
          maxHeight: '260px',
          overflowY: 'auto',
          padding: '6px',
        }}>
          {results.map((item, idx) => (
            <div
              key={item.areaId || idx}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                background: selectedIndex === idx ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
                border: selectedIndex === idx ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <MapPin size={16} color={selectedIndex === idx ? '#ca8a04' : '#94a3b8'} />
                <span style={{
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: selectedIndex === idx ? '#0f172a' : '#1e293b',
                }}>
                  {item.name}
                </span>
              </div>
              <span style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                color: '#64748b',
                background: '#f1f5f9',
                padding: '3px 8px',
                borderRadius: '4px',
                fontWeight: 600,
              }}>
                {item.areaId}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
