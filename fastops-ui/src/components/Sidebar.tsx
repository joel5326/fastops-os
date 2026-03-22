'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  engineStatus: 'online' | 'offline' | 'connecting';
}

const NAV_ITEMS = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'mission-control', label: 'Mission Control', icon: '🎯' },
  { id: 'contracts', label: 'Contracts', icon: '📋' },
  { id: 'comms', label: 'Comms', icon: '📡' },
];

export default function Sidebar({ activeView, onViewChange, engineStatus }: SidebarProps) {
  const [adapters, setAdapters] = useState<string[]>([]);

  useEffect(() => {
    apiClient.getAdapters().then((a) => setAdapters(a.available)).catch(() => {});
  }, [engineStatus]);

  const statusColor = engineStatus === 'online' ? 'var(--green)' : engineStatus === 'connecting' ? 'var(--yellow)' : 'var(--red)';

  return (
    <aside style={{
      width: 220,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
    }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.5px' }}>FASTOPS OS</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>AI SEAL Team Engine</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
          <span style={{ color: 'var(--text-secondary)' }}>
            {engineStatus === 'online' ? `${adapters.length} model${adapters.length !== 1 ? 's' : ''} online` : engineStatus}
          </span>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '8px 0' }}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '10px 16px',
              background: activeView === item.id ? 'var(--bg-hover)' : 'transparent',
              color: activeView === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              textAlign: 'left',
              borderLeft: activeView === item.id ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
        {adapters.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {adapters.map((a) => (
              <span key={a} style={{
                background: 'var(--bg-surface)',
                padding: '2px 6px',
                borderRadius: 3,
                fontSize: 10,
              }}>{a}</span>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
