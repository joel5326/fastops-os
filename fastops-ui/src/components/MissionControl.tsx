'use client';

import { useState, useEffect } from 'react';
import { apiClient, type SessionInfo } from '@/lib/api';
import { getSocket } from '@/lib/ws';

interface ModelCard {
  name: string;
  sessions: SessionInfo[];
  totalCost: number;
  totalTokens: number;
  status: 'active' | 'idle';
}

export default function MissionControl() {
  const [models, setModels] = useState<ModelCard[]>([]);
  const [engineState, setEngineState] = useState<any>(null);
  const [events, setEvents] = useState<Array<{ type: string; data: any; ts: string }>>([]);

  const refresh = async () => {
    try {
      const [sessions, adapters, state] = await Promise.all([
        apiClient.listSessions(),
        apiClient.getAdapters(),
        apiClient.getState(),
      ]);
      setEngineState(state);

      const cardMap = new Map<string, ModelCard>();
      for (const name of adapters.available) {
        cardMap.set(name, { name, sessions: [], totalCost: 0, totalTokens: 0, status: 'idle' });
      }
      for (const s of sessions) {
        const card = cardMap.get(s.modelId);
        if (card) {
          card.sessions.push(s);
          card.totalCost += s.costAccumulated || 0;
          card.totalTokens += s.tokensBurned || 0;
          if (s.status === 'active') card.status = 'active';
        }
      }
      setModels([...cardMap.values()]);
    } catch { /* engine offline */ }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);

    const socket = getSocket();
    const unsub = socket.on('*', (event: { type: string; data: any }) => {
      setEvents((prev) => [...prev.slice(-49), { ...event, ts: new Date().toISOString() }]);
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  const totalCost = models.reduce((sum, m) => sum + m.totalCost, 0);
  const totalSessions = models.reduce((sum, m) => sum + m.sessions.length, 0);
  const halted = engineState?.halted;

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Mission Control</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {models.length} models · {totalSessions} sessions · ${totalCost.toFixed(4)} total cost
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={refresh}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Refresh
          </button>
          <button
            onClick={async () => {
              if (halted) await apiClient.releaseKillSwitch();
              else await apiClient.killSwitch();
              refresh();
            }}
            style={{
              padding: '8px 16px',
              background: halted ? 'var(--green)' : 'var(--red)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {halted ? 'Release Kill Switch' : 'KILL SWITCH'}
          </button>
        </div>
      </div>

      {/* Model cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {models.map((m) => (
          <div key={m.name} style={{
            background: 'var(--bg-surface)',
            border: `1px solid ${m.status === 'active' ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8,
            padding: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{m.name}</span>
              <span style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 10,
                background: m.status === 'active' ? 'rgba(166,227,161,0.15)' : 'rgba(108,112,134,0.15)',
                color: m.status === 'active' ? 'var(--green)' : 'var(--text-muted)',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}>
                {m.status}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Sessions</div>
                <div style={{ fontWeight: 600 }}>{m.sessions.length}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Cost</div>
                <div style={{ fontWeight: 600 }}>${m.totalCost.toFixed(4)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Tokens</div>
                <div style={{ fontWeight: 600 }}>{m.totalTokens.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Messages</div>
                <div style={{ fontWeight: 600 }}>{m.sessions.reduce((s, sess) => s + sess.messageCount, 0)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Live event feed */}
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Live Events</h2>
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          maxHeight: 300,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
        }}>
          {events.length === 0 && (
            <div style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center' }}>
              Waiting for engine events...
            </div>
          )}
          {events.slice().reverse().map((ev, i) => (
            <div key={i} style={{
              padding: '6px 12px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: 12,
            }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 70 }}>
                {new Date(ev.ts).toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <span style={{ color: 'var(--accent)' }}>{ev.type}</span>
              <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {JSON.stringify(ev.data).slice(0, 120)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
