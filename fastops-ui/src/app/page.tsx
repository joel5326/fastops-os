'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  Crosshair,
  FileCheck,
  Radio,
  Users,
  Settings,
  Zap,
  Circle,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import ChatView from '@/components/ChatView';
import MissionControl from '@/components/MissionControl';
import ContractsView from '@/components/ContractsView';
import CommsView from '@/components/CommsView';
import TeamPanel from '@/components/TeamPanel';
import SettingsPanel from '@/components/SettingsPanel';
import { apiClient, type ProductInfo } from '@/lib/api';
import CommandPalette, { type CommandAction } from '@/components/CommandPalette';

type View = 'chat' | 'mission-control' | 'contracts' | 'comms' | 'team' | 'settings';

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
  const [commandOpen, setCommandOpen] = useState(false);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('all');

  const check = useCallback(async () => {
    try {
      const [health, adapters, productList] = await Promise.all([
        apiClient.health(),
        apiClient.getAdapters(),
        apiClient.getProducts().catch(() => []),
      ]);
      setEngineStatus(health.running ? 'online' : 'offline');
      setAdapterCount(adapters.available.length);
      setProducts(productList);
      setSelectedProductId((prev) => {
        if (prev === 'all') return prev;
        const stillExists = productList.some((p) => p.id === prev);
        return stillExists ? prev : 'all';
      });
    } catch {
      setEngineStatus('offline');
      setAdapterCount(0);
      setProducts([]);
      setSelectedProductId('all');
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [check]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const commandActions = useMemo<CommandAction[]>(() => {
    return [
      {
        id: 'new-session',
        label: 'New Session',
        subtitle: 'Create a chat session with default provider',
        icon: Plus,
        keywords: ['chat', 'session', 'new'],
        run: async () => {
          setActiveView('chat');
          window.dispatchEvent(new CustomEvent('fastops:new-session'));
        },
      },
      {
        id: 'kill-switch',
        label: 'Kill Switch',
        subtitle: 'Halt the engine immediately',
        icon: ShieldAlert,
        keywords: ['halt', 'stop', 'engine', 'safety'],
        run: async () => {
          await apiClient.killSwitch();
          await check();
        },
      },
      {
        id: 'refresh',
        label: 'Refresh',
        subtitle: 'Refresh engine status and adapter count',
        icon: RefreshCw,
        keywords: ['reload', 'status', 'adapters'],
        run: async () => {
          await check();
        },
      },
      {
        id: 'view-chat',
        label: 'Switch to Chat',
        icon: MessageSquare,
        keywords: ['view', 'chat'],
        run: () => setActiveView('chat'),
      },
      {
        id: 'view-mission-control',
        label: 'Switch to Mission Control',
        icon: Crosshair,
        keywords: ['view', 'mission', 'control'],
        run: () => setActiveView('mission-control'),
      },
      {
        id: 'view-contracts',
        label: 'Switch to Contracts',
        icon: FileCheck,
        keywords: ['view', 'contracts'],
        run: () => setActiveView('contracts'),
      },
      {
        id: 'view-comms',
        label: 'Switch to Comms',
        icon: Radio,
        keywords: ['view', 'comms', 'messages'],
        run: () => setActiveView('comms'),
      },
      {
        id: 'view-team',
        label: 'Switch to Team',
        icon: Users,
        keywords: ['view', 'team', 'roster'],
        run: () => setActiveView('team'),
      },
      {
        id: 'view-settings',
        label: 'Switch to Settings',
        icon: Settings,
        keywords: ['view', 'settings', 'preferences', 'config'],
        run: () => setActiveView('settings'),
      },
    ];
  }, [check]);

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
          <button
            type="button"
            className={`activity-btn${activeView === 'settings' ? ' active' : ''}`}
            title="Settings"
            onClick={() => setActiveView('settings')}
          >
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
            <span>{activeView === 'settings' ? 'Settings' : NAV_ITEMS.find((n) => n.id === activeView)?.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Product</span>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 11,
                  padding: '2px 6px',
                }}
              >
                <option value="all">All products</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Circle size={6} fill={statusColor} color={statusColor} />
              {engineStatus === 'online' ? `${adapterCount} providers` : engineStatus}
            </span>
          </div>
        </div>

        {/* View content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {activeView === 'chat' && <ChatView />}
          {activeView === 'mission-control' && (
            <MissionControl selectedProductId={selectedProductId} products={products} />
          )}
          {activeView === 'contracts' && <ContractsView />}
          {activeView === 'comms' && <CommsView />}
          {activeView === 'team' && <TeamPanel selectedProductId={selectedProductId} />}
          {activeView === 'settings' && <SettingsPanel />}
        </div>
      </main>
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        actions={commandActions}
      />
    </div>
  );
}
