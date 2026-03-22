'use client';

import { useState, useRef, useEffect } from 'react';
import { apiClient, type SessionInfo, type ChatMessage } from '@/lib/api';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  usage?: { inputTokens?: number; outputTokens?: number; cost?: number };
  duration?: number;
  toolCallCount?: number;
}

export default function ChatView() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState('anthropic');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiClient.getAdapters().then((a) => setAvailableModels(a.available)).catch(() => {});
    apiClient.listSessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const createSession = async () => {
    try {
      const session = await apiClient.createSession(selectedModel);
      setActiveSession(session.id);
      setMessages([]);
      const updated = await apiClient.listSessions();
      setSessions(updated);
    } catch (err: any) {
      console.error('Failed to create session:', err.message);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeSession || sending) return;

    const userMsg: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const result = await apiClient.sendMessage(activeSession, userMsg.content);
      const assistantMsg: Message = {
        role: 'assistant',
        content: result.content,
        timestamp: new Date().toISOString(),
        usage: result.usage,
        duration: result.duration,
        toolCallCount: result.toolCallCount,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Session sidebar */}
      <div style={{
        width: 200,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button
            onClick={createSession}
            style={{
              width: '100%',
              padding: '8px',
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            + New Session
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActiveSession(s.id);
                apiClient.getMessages(s.id).then((msgs) => {
                  setMessages(msgs.map((m) => ({ ...m, timestamp: '' })));
                }).catch(() => {});
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                background: activeSession === s.id ? 'var(--bg-hover)' : 'transparent',
                color: activeSession === s.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none',
                borderLeft: activeSession === s.id ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 500 }}>{s.modelId}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {s.messageCount} msg · ${(s.costAccumulated || 0).toFixed(4)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!activeSession ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 12,
            color: 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 48 }}>⚡</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)' }}>FastOps OS</div>
            <div style={{ fontSize: 13 }}>Select a model and create a session to begin.</div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {messages.map((msg, i) => (
                <div key={i} style={{
                  marginBottom: 16,
                  padding: '12px 16px',
                  background: msg.role === 'user' ? 'var(--bg-surface)' : 'transparent',
                  borderRadius: 8,
                  borderLeft: msg.role === 'assistant' ? '2px solid var(--accent)' : 'none',
                }}>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginBottom: 4,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    {msg.role === 'user' ? 'You' : 'Agent'}
                    {msg.duration != null && (
                      <span style={{ marginLeft: 8, fontWeight: 400 }}>
                        {(msg.duration / 1000).toFixed(1)}s
                        {msg.toolCallCount ? ` · ${msg.toolCallCount} tools` : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div style={{
                  padding: '12px 16px',
                  borderLeft: '2px solid var(--accent)',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}>
                  Thinking...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: '12px 24px 16px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
            }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
                  rows={3}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    resize: 'none',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  style={{
                    padding: '10px 20px',
                    background: sending || !input.trim() ? 'var(--bg-surface)' : 'var(--accent)',
                    color: sending || !input.trim() ? 'var(--text-muted)' : 'var(--bg-primary)',
                    border: 'none',
                    borderRadius: 8,
                    cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    alignSelf: 'flex-end',
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
