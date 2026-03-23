'use client';

import { useState, useEffect } from 'react';
import {
  MessageSquare,
  Crosshair,
  FileCheck,
  Radio,
  Users,
  Settings,
  Zap,
  Circle,
} from 'lucide-react';
import ChatView from '@/components/ChatView';
import MissionControl from '@/components/MissionControl';
import ContractsView from '@/components/ContractsView';
import CommsView from '@/components/CommsView';
import TeamPanel from '@/components/TeamPanel';
import { apiClient } from '@/lib/api';

type View = 'chat' | 'mission-control' | 'contracts' | 'comms' | 'team';

const NAV_ITEMS: Array<{ id: View; label: string; icon: typeof MessageSquare }> = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'mission-control', label: 'Mission Control', icon: Crosshair },
  { id: 'contracts', label: 'Contracts', icon: FileCheck },
  { id: 'comms', label: 'Comms', icon: Radio },
  { id: 'team', label: 'Team', icon: Users },
];

export default function Home() {
  const [activeView, setActiveView] = useState<View>('chat');
  const [engineStatus, setEngineStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');
  const [adapterCount, setAdapterCount] = useState(0);

  useEffect(() => {
    const check = async () => {
      try {
        const [health, adapters] = await Promise.all([
          apiClient.health(),
          apiClient.getAdapters(),
        ]);
        setEngineStatus(health.running ? 'online' : 'offline');
        setAdapterCount(adapters.available.length);
      } catch {
        setEngineStatus('offline');
        setAdapterCount(0);
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = engineStatus === 'online'
    ? 'var(--green)'
    : engineStatus === 'connecting'
      ? 'var(--yellow)'
      : 'var(--red)';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Activity Bar */}
      <div style={{
        width: 48,
        background: 'var(--bg-activity)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{
          width: 48,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}>
          <Zap size={20} style={{ color: 'var(--accent)' }} />
        </div>

        {/* Nav icons */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`activity-btn${activeView === item.id ? ' active' : ''}`}
                onClick={() => setActiveView(item.id)}
                title={item.label}
              >
                <Icon size={20} strokeWidth={1.5} />
              </button>
            );
          })}
        </div>

        {/* Bottom: engine status + settings */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          paddingBottom: 8,
        }}>
          <button className="activity-btn" title={`Engine: ${engineStatus}`}>
            <Circle
              size={8}
              fill={statusColor}
              color={statusColor}
            />
          </button>
          <button className="activity-btn" title="Settings">
            <Settings size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Status bar */}
        <div style={{
          height: 28,
          background: 'var(--bg-activity)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontSize: 11,
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>FASTOPS OS</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span>{NAV_ITEMS.find((n) => n.id === activeView)?.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Circle size={6} fill={statusColor} color={statusColor} />
              {engineStatus === 'online' ? `${adapterCount} providers` : engineStatus}
            </span>
          </div>
        </div>

        {/* View content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {activeView === 'chat' && <ChatView />}
          {activeView === 'mission-control' && <MissionControl />}
          {activeView === 'contracts' && <ContractsView />}
          {activeView === 'comms' && <CommsView />}
          {activeView === 'team' && <TeamPanel />}
        </div>
      </main>
    </div>
  );
}
