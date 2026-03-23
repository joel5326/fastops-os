'use client';

import { useState, useEffect } from 'react';
import { apiClient, type SessionInfo, type TeamMember, type MissionInfo } from '@/lib/api';
import { getSocket } from '@/lib/ws';
import {
  Crosshair,
  AlertTriangle,
  Cpu,
  DollarSign,
  Activity,
  RefreshCw,
  Zap,
  Shield,
  Target,
  Circle,
  OctagonX,
  PlayCircle,
  ArrowRight,
  User,
  BarChart3,
} from 'lucide-react';

interface ModelCard {
  name: string;
  sessions: SessionInfo[];
  totalCost: number;
  totalTokens: number;
  totalMessages: number;
  status: 'active' | 'idle';
}

export default function MissionControl() {
  const [models, setModels] = useState<ModelCard[]>([]);
  const [engineState, setEngineState] = useState<any>(null);
  const [events, setEvents] = useState<Array<{ type: string; data: any; ts: string }>>([]);
  const [missions, setMissions] = useState<MissionInfo[]>([]);

  const refresh = async () => {
    try {
      const [sessions, adapters, state, missionsRes] = await Promise.all([
        apiClient.listSessions(),
        apiClient.getAdapters(),
        apiClient.getState(),
        apiClient.getMissions(),
      ]);
      setEngineState(state);
      setMissions(missionsRes.missions || []);

      const cardMap = new Map<string, ModelCard>();
      for (const name of adapters.available) {
        cardMap.set(name, { name, sessions: [], totalCost: 0, totalTokens: 0, totalMessages: 0, status: 'idle' });
      }
      for (const s of sessions) {
        const card = cardMap.get(s.modelId);
        if (card) {
          card.sessions.push(s);
          card.totalCost += s.costAccumulated || 0;
          card.totalTokens += s.tokensBurned || 0;
          card.totalMessages += s.messageCount || 0;
          if (s.status === 'active') card.status = 'active';
        }
      }
      setModels([...cardMap.values()]);
    } catch {}
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    const socket = getSocket();
    const unsub = socket.on('*', (event: { type: string; data: any }) => {
      setEvents((prev) => [...prev.slice(-99), { ...event, ts: new Date().toISOString() }]);
    });
    return () => { clearInterval(interval); unsub(); };
  }, []);

  const totalCost = models.reduce((sum, m) => sum + m.totalCost, 0);
  const totalSessions = models.reduce((sum, m) => sum + m.sessions.length, 0);
  const totalTokens = models.reduce((sum, m) => sum + m.totalTokens, 0);
  const totalMessages = models.reduce((sum, m) => sum + m.totalMessages, 0);
  const halted = engineState?.halted;

  const missionsByStatus = {
    blocked: missions.filter((m) => m.status === 'blocked'),
    in_progress: missions.filter((m) => m.status === 'in_progress'),
    open: missions.filter((m) => m.status === 'open'),
    completed: missions.filter((m) => m.status === 'completed'),
  };

  const providerColors: Record<string, string> = {
    anthropic: 'var(--orange)',
    openai: 'var(--green)',
    google: 'var(--accent)',
    openrouter: 'var(--mauve)',
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Crosshair size={20} /> Mission Control
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={refresh}
              style={{
                padding: '6px 14px',
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
            <button
              onClick={async () => {
                if (halted) await apiClient.releaseKillSwitch();
                else await apiClient.killSwitch();
                refresh();
              }}
              style={{
                padding: '6px 14px',
                background: halted ? 'var(--green-dim)' : 'var(--red-dim)',
                color: halted ? 'var(--green)' : 'var(--red)',
                border: `1px solid ${halted ? 'var(--green)' : 'var(--red)'}`,
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {halted ? <><PlayCircle size={12} /> Release</> : <><OctagonX size={12} /> Kill Switch</>}
            </button>
          </div>
        </div>

        {/* Top metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Providers', value: models.length.toString(), icon: Cpu, color: 'var(--accent)' },
            { label: 'Sessions', value: totalSessions.toString(), icon: Activity, color: 'var(--green)' },
            { label: 'Tokens', value: totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens.toString(), icon: BarChart3, color: 'var(--yellow)' },
            { label: 'Cost', value: `$${totalCost.toFixed(4)}`, icon: DollarSign, color: 'var(--orange)' },
          ].map((m) => (
            <div key={m.label} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="metric-label">{m.label}</div>
                  <div className="metric-value">{m.value}</div>
                </div>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-md)',
                  background: `${m.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <m.icon size={16} style={{ color: m.color }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Provider cards */}
        <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
          Providers
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 24 }}>
          {models.map((m) => {
            const color = providerColors[m.name] || 'var(--text-secondary)';
            return (
              <div
                key={m.name}
                className={`card${m.status === 'active' ? ' card-active' : ''}`}
                style={{ padding: 16 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: color,
                    }} />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                  </div>
                  <span className={`badge status-${m.status}`}>{m.status}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div className="metric-label">Sessions</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{m.sessions.length}</div>
                  </div>
                  <div>
                    <div className="metric-label">Messages</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{m.totalMessages}</div>
                  </div>
                  <div>
                    <div className="metric-label">Tokens</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{m.totalTokens.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="metric-label">Cost</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>${m.totalCost.toFixed(4)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mission Board */}
        <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
          Mission Board
        </h2>
        {missions.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <Target size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No active missions.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
            {/* Blocked first */}
            {missionsByStatus.blocked.map((m) => (
              <MissionCard key={m.id} mission={m} />
            ))}
            {missionsByStatus.in_progress.map((m) => (
              <MissionCard key={m.id} mission={m} />
            ))}
            {missionsByStatus.open.map((m) => (
              <MissionCard key={m.id} mission={m} />
            ))}
          </div>
        )}

        {/* Live event feed */}
        <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={12} /> Live Events
        </h2>
        <div className="card" style={{
          maxHeight: 280,
          overflowY: 'auto',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 11.5,
        }}>
          {events.length === 0 && (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center', fontSize: 12 }}>
              Waiting for engine events...
            </div>
          )}
          {events.slice().reverse().map((ev, i) => (
            <div key={i} style={{
              padding: '5px 14px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
            }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 60, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                {new Date(ev.ts).toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <span style={{ color: 'var(--accent)', minWidth: 140 }}>{ev.type}</span>
              <span style={{
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {JSON.stringify(ev.data).slice(0, 120)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MissionCard({ mission }: { mission: MissionInfo }) {
  const borderColor = mission.status === 'blocked' ? 'var(--red)'
    : mission.status === 'in_progress' ? 'var(--accent)'
      : 'var(--border)';

  return (
    <div className="card" style={{
      padding: 14,
      borderLeft: `3px solid ${borderColor}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{mission.title}</div>
        <span className={`badge status-${mission.status}`} style={{ flexShrink: 0, marginLeft: 8 }}>
          {mission.status.replace('_', ' ')}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span>{mission.id}</span>
        {mission.priority && <span>P: {mission.priority}</span>}
        {mission.owner && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <User size={10} /> {mission.owner}
          </span>
        )}
      </div>
      {mission.blockedBy && mission.blockedBy.length > 0 && (
        <div style={{
          marginTop: 6,
          padding: '4px 8px',
          background: 'var(--red-dim)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 11,
          color: 'var(--red)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <AlertTriangle size={10} />
          Blocked by: {mission.blockedBy.join(', ')}
        </div>
      )}
    </div>
  );
}
