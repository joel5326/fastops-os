'use client';

import { useState, useEffect, useRef } from 'react';
import { apiClient, type CommsMessage } from '@/lib/api';
import { getSocket } from '@/lib/ws';
import {
  Hash,
  Send,
  Radio,
  User,
  AtSign,
  ArrowDown,
} from 'lucide-react';

const AGENT_COLORS: Record<string, string> = {
  claude: 'var(--orange)',
  gpt: 'var(--green)',
  gemini: 'var(--accent)',
  composer: 'var(--mauve)',
  kimi: 'var(--yellow)',
  joel: 'var(--red)',
};

function getAgentColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(AGENT_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return 'var(--text-secondary)';
}

export default function CommsView() {
  const [channels, setChannels] = useState<string[]>([]);
  const [activeChannel, setActiveChannel] = useState('general');
  const [messages, setMessages] = useState<CommsMessage[]>([]);
  const [input, setInput] = useState('');
  const [senderName, setSenderName] = useState('joel');
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

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
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  const handleScroll = () => {
    if (!messagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 80);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    try {
      await apiClient.sendComms(activeChannel, input.trim(), senderName);
      setInput('');
      setAutoScroll(true);
    } catch (err: any) {
      console.error('Failed to send:', err.message);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Channel list */}
      <div style={{
        width: 200,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <Radio size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Channels</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {channels.map((ch) => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                padding: '7px 14px',
                background: activeChannel === ch ? 'var(--bg-hover)' : 'transparent',
                color: activeChannel === ch ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none',
                borderLeft: activeChannel === ch ? '2px solid var(--accent)' : '2px solid transparent',
                textAlign: 'left',
                fontSize: 13,
                transition: 'background var(--transition-fast)',
              }}
            >
              <Hash size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              {ch}
            </button>
          ))}
          {channels.length === 0 && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No channels
            </div>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Channel header */}
        <div style={{
          padding: '8px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}>
          <Hash size={16} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{activeChannel}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
            {messages.length} messages
          </span>
        </div>

        {/* Messages */}
        <div
          ref={messagesRef}
          onScroll={handleScroll}
          style={{ flex: 1, overflowY: 'auto', padding: '8px 0', position: 'relative' }}
        >
          {messages.map((msg, i) => {
            const color = getAgentColor(msg.from);
            const showDate = i === 0 || (
              new Date(msg.ts).toDateString() !== new Date(messages[i - 1].ts).toDateString()
            );

            return (
              <div key={msg.id}>
                {showDate && (
                  <div style={{
                    textAlign: 'center',
                    padding: '12px 0 6px',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    fontWeight: 500,
                  }}>
                    {new Date(msg.ts).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                )}
                <div style={{
                  padding: '6px 20px',
                  display: 'flex',
                  gap: 10,
                  transition: 'background var(--transition-fast)',
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 'var(--radius-md)',
                    background: `${color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                  }}>
                    <span style={{ color, fontSize: 14, fontWeight: 700 }}>
                      {msg.from.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color }}>{msg.from}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(msg.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      marginTop: 2,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />

          {/* Scroll to bottom */}
          {!autoScroll && (
            <button
              onClick={() => {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                setAutoScroll(true);
              }}
              style={{
                position: 'sticky',
                bottom: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '6px 14px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                fontSize: 11,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <ArrowDown size={12} /> New messages
            </button>
          )}
        </div>

        {/* Input */}
        <div style={{
          padding: '10px 20px 14px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            gap: 8,
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '4px 4px 4px 10px',
            alignItems: 'center',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              borderRight: '1px solid var(--border)',
              paddingRight: 8,
              flexShrink: 0,
            }}>
              <AtSign size={12} style={{ color: 'var(--text-muted)' }} />
              <input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                style={{
                  width: 60,
                  padding: '4px 0',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  fontSize: 12,
                }}
              />
            </div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
              placeholder={`Message #${activeChannel}`}
              style={{
                flex: 1,
                padding: '8px 0',
                background: 'transparent',
                color: 'var(--text-primary)',
                border: 'none',
                fontSize: 13,
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--radius-md)',
                background: input.trim() ? 'var(--accent)' : 'transparent',
                color: input.trim() ? 'var(--bg-primary)' : 'var(--text-muted)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
