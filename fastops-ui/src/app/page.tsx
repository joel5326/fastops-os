'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatView from '@/components/ChatView';
import MissionControl from '@/components/MissionControl';
import ContractsView from '@/components/ContractsView';
import CommsView from '@/components/CommsView';
import { apiClient } from '@/lib/api';

export default function Home() {
  const [activeView, setActiveView] = useState('chat');
  const [engineStatus, setEngineStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');

  useEffect(() => {
    const check = async () => {
      try {
        const health = await apiClient.health();
        setEngineStatus(health.running ? 'online' : 'offline');
      } catch {
        setEngineStatus('offline');
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar activeView={activeView} onViewChange={setActiveView} engineStatus={engineStatus} />
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {activeView === 'chat' && <ChatView />}
        {activeView === 'mission-control' && <MissionControl />}
        {activeView === 'contracts' && <ContractsView />}
        {activeView === 'comms' && <CommsView />}
      </main>
    </div>
  );
}
