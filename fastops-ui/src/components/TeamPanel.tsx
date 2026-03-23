'use client';

import { useState, useEffect } from 'react';
import { apiClient, type TeamMember, type SessionInfo } from '@/lib/api';
import {
  User,
  Activity,
  Clock,
  Cpu,
  DollarSign,
  RefreshCw,
  Circle,
  Shield,
} from 'lucide-react';

export default function TeamPanel() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refresh = async () => {
    try {
      const [teamRes, sessionRes] = await Promise.all([
        apiClient.getTeam(),
        apiClient.listSessions(),
      ]);
      setTeam(teamRes.team || []);
      setSessions(sessionRes);
      setLastRefresh(new Date());
    } catch {}
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  const getModelSessions = (modelId: string) =>
    sessions.filter((s) => s.modelId === modelId);

  const active = team.filter((t) => t.status === 'active');
  const idle = team.filter((t) => t.status === 'idle');
  const offline = team.filter((t) => t.status === 'offline');

  const renderMember = (member: TeamMember) => {
    const memberSessions = getModelSessions(member.modelId);
    const totalCost = memberSessions.reduce((s, sess) => s + (sess.costAccumulated || 0), 0);
    const totalTokens = memberSessions.reduce((s, sess) => s + (sess.tokensBurned || 0), 0);

    const statusColor = member.status === 'active' ? 'var(--green)'
      : member.status === 'idle' ? 'var(--yellow)' : 'var(--text-muted)';

    return (
      <div key={member.modelId} className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              background: member.status === 'active' ? 'var(--green-dim)' : 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <User size={18} style={{ color: statusColor }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{member.modelId}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                <Circle size={6} fill={statusColor} color={statusColor} />
                {member.status}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {member.onboarded && (
              <span className="badge status-completed" style={{ fontSize: 9 }}>
                <Shield size={9} style={{ marginRight: 2 }} /> onboarded
              </span>
            )}
          </div>
        </div>

        {member.currentTask && (
          <div style={{
            padding: '6px 10px',
            background: 'var(--accent-dim)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--accent)',
            marginBottom: 10,
          }}>
            {member.currentTask}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <div className="metric-label">Context</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              <span style={{
                color: member.contextUsagePercent > 80 ? 'var(--red)'
                  : member.contextUsagePercent > 50 ? 'var(--yellow)'
                    : 'var(--green)',
              }}>
                {member.contextUsagePercent}%
              </span>
            </div>
          </div>
          <div>
            <div className="metric-label">Cost</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>${totalCost.toFixed(4)}</div>
          </div>
          <div>
            <div className="metric-label">Sessions</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{memberSessions.length}</div>
          </div>
        </div>

        {/* Context usage bar */}
        <div style={{
          marginTop: 10,
          height: 3,
          background: 'var(--bg-hover)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(member.contextUsagePercent, 100)}%`,
            background: member.contextUsagePercent > 80 ? 'var(--red)'
              : member.contextUsagePercent > 50 ? 'var(--yellow)'
                : 'var(--green)',
            borderRadius: 2,
            transition: 'width 300ms ease',
          }} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={20} /> Team Status
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {active.length} active · {idle.length} idle · {offline.length} offline
            </p>
          </div>
          <button
            onClick={refresh}
            style={{
              padding: '6px 12px',
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
        </div>

        {team.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <User size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              No team members registered yet. Create a session to see model status.
            </div>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                  Active
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                  {active.map(renderMember)}
                </div>
              </div>
            )}
            {idle.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                  Idle
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                  {idle.map(renderMember)}
                </div>
              </div>
            )}
            {offline.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                  Offline
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                  {offline.map(renderMember)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
