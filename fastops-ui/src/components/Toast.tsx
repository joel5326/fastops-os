'use client';

import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/ws';

interface Toast {
  id: string;
  type: string;
  message: string;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const socket = getSocket();
    
    const unsub = socket.on('*', (event: { type: string; data: any }) => {
      // Filter out high-volume or noisy events if necessary
      if (event.type === '_connected' || event.type === '_disconnected') return;

      const id = Math.random().toString(36).substring(2, 9);
      
      let message = '';
      if (typeof event.data === 'object' && event.data !== null) {
        if (event.data.sessionId) message += `Session: ${event.data.sessionId} `;
        if (event.data.modelId) message += `Model: ${event.data.modelId} `;
        if (event.data.channel) message += `Channel: ${event.data.channel} `;
        
        if (!message) {
          message = JSON.stringify(event.data).slice(0, 60);
          if (JSON.stringify(event.data).length > 60) message += '...';
        }
      } else {
        message = String(event.data).slice(0, 60);
      }

      setToasts(prev => [...prev, { id, type: event.type, message }]);

      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 5000);
    });

    return () => unsub();
  }, []);

  return (
    <>
      {children}
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 9999,
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            boxShadow: 'var(--shadow-lg)',
            minWidth: 250,
            maxWidth: 400,
            animation: 'slideIn 0.2s ease-out forwards',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 4 }}>
              {t.type}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
              {t.message || 'Event received'}
            </div>
          </div>
        ))}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}} />
    </>
  );
}
