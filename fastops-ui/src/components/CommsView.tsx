'use client';

import { useState, useEffect, useRef } from 'react';
import { apiClient, type CommsMessage } from '@/lib/api';
import { getSocket } from '@/lib/ws';

export default function CommsView() {
  const [channels, setChannels] = useState<string[]>([]);
  const [activeChannel, setActiveChannel] = useState('general');
  const [messages, setMessages] = useState<CommsMessage[]>([]);
  const [input, setInput] = useState('');
  const [senderName, setSenderName] = useState('joel');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.listChannels().then((r) => setChannels(r.channels)).catch(() => {});
  }, []);

  useEffect(() => {
    apiClient.getComms(activeChannel, 100).then(setMessages).catch(() => setMessages([]));
  }, [activeChannel]);

  useEffect(() => {
    const socket = getSocket();
    const unsub = socket.on('comms.message', (msg: CommsMessage) => {
      if (msg.channel === activeChannel) {
        setMessages((prev) => [...prev, msg]);
      }
    });
    return unsub;
  }, [activeChannel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    try {
      await apiClient.sendComms(activeChannel, input.trim(), senderName);
      setInput('');
    } catch (err: any) {
      console.error('Failed to send:', err.message);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Channel list */}
      <div style={{
        width: 180,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600 }}>
          Channels
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {channels.map((ch) => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 16px',
                background: activeChannel === ch ? 'var(--bg-hover)' : 'transparent',
                color: activeChannel === ch ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none',
                borderLeft: activeChannel === ch ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
              }}
            >
              # {ch}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          fontSize: 15,
          fontWeight: 600,
        }}>
          # {activeChannel}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8, fontWeight: 400 }}>
            {messages.length} messages
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{
              padding: '8px 16px',
              display: 'flex',
              gap: 10,
            }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                flexShrink: 0,
                color: 'var(--accent)',
                fontWeight: 600,
              }}>
                {msg.from.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{msg.from}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(msg.ts).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          gap: 8,
        }}>
          <input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Name"
            style={{
              width: 80,
              padding: '8px 10px',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
            placeholder={`Message #${activeChannel}`}
            style={{
              flex: 1,
              padding: '8px 14px',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            style={{
              padding: '8px 16px',
              background: input.trim() ? 'var(--accent)' : 'var(--bg-surface)',
              color: input.trim() ? 'var(--bg-primary)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 6,
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
