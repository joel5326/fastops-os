'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiClient, type SessionInfo, type ChatMessage } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Plus,
  Send,
  Loader2,
  User,
  Bot,
  Trash2,
  Clock,
  Cpu,
  DollarSign,
  ChevronDown,
  Hash,
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  usage?: { inputTokens?: number; outputTokens?: number; cost?: number };
  duration?: number;
  toolCallCount?: number;
  streaming?: boolean;
}

interface ModelOption {
  provider: string;
  model: string;
  display: string;
}

export default function ChatView() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.getAdapters().then((a) => {
      const opts = a.models.map((m) => ({
        ...m,
        display: `${m.provider}/${m.model}`,
      }));
      setModelOptions(opts);
      if (a.available.length > 0 && !a.available.includes(selectedProvider)) {
        setSelectedProvider(a.available[0]);
      }
    }).catch(() => {});
    refreshSessions();
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await apiClient.listSessions();
      setSessions(list);
    } catch {}
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const createSession = async () => {
    try {
      const session = await apiClient.createSession(selectedProvider);
      setActiveSession(session.id);
      setMessages([]);
      await refreshSessions();
    } catch (err: any) {
      console.error('Failed to create session:', err.message);
    }
  };

  const deleteSession = async (id: string) => {
    try {
      await apiClient.deleteSession(id);
      if (activeSession === id) {
        setActiveSession(null);
        setMessages([]);
      }
      await refreshSessions();
    } catch {}
  };

  const loadSession = async (id: string) => {
    setActiveSession(id);
    try {
      const msgs = await apiClient.getMessages(id);
      setMessages(msgs.map((m) => ({
        ...m,
        timestamp: new Date().toISOString(),
      })));
    } catch {
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeSession || sending) return;

    const content = input.trim();
    const userMsg: Message = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    const streamingMsg: Message = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      streaming: true,
    };
    setMessages((prev) => [...prev, streamingMsg]);

    try {
      const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
      const res = await fetch(`${BASE}/api/sessions/${activeSession}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok || !res.body) {
        const result = await apiClient.sendMessage(activeSession, content);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: result.content,
            timestamp: new Date().toISOString(),
            usage: result.usage,
            duration: result.duration,
            toolCallCount: result.toolCallCount,
          };
          return updated;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;

          try {
            const event = JSON.parse(raw);
            if (event.type === 'delta' && event.delta) {
              finalContent += event.delta;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: finalContent,
                };
                return updated;
              });
            } else if (event.type === 'complete') {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: finalContent || event.content || '',
                  timestamp: new Date().toISOString(),
                  usage: event.usage,
                  duration: event.latencyMs,
                  toolCallCount: event.toolCallCount,
                  streaming: false,
                };
                return updated;
              });
            }
          } catch {}
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.streaming) {
          updated[updated.length - 1] = { ...last, streaming: false };
        }
        return updated;
      });
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `Error: ${err.message}`,
          timestamp: new Date().toISOString(),
        };
        return updated;
      });
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

  const activeSessionInfo = sessions.find((s) => s.id === activeSession);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Session sidebar */}
      <div style={{
        width: 240,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* New session */}
        <div style={{ padding: 12 }}>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              style={{
                width: '100%',
                padding: '7px 10px',
                background: 'var(--bg-input)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{selectedProvider}</span>
              <ChevronDown size={12} />
            </button>
            {showModelPicker && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                marginTop: 2,
                zIndex: 50,
                boxShadow: 'var(--shadow-lg)',
                maxHeight: 200,
                overflowY: 'auto',
              }}>
                {[...new Set(modelOptions.map((m) => m.provider))].map((p) => (
                  <button
                    key={p}
                    onClick={() => { setSelectedProvider(p); setShowModelPicker(false); }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px 10px',
                      background: selectedProvider === p ? 'var(--bg-hover)' : 'transparent',
                      color: selectedProvider === p ? 'var(--text-primary)' : 'var(--text-secondary)',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 12,
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={createSession}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Plus size={14} />
            New Session
          </button>
        </div>

        {/* Sessions list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sessions.length === 0 && (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No sessions yet
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                background: activeSession === s.id ? 'var(--bg-hover)' : 'transparent',
                borderLeft: activeSession === s.id ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'background var(--transition-fast)',
                gap: 8,
              }}
            >
              <button
                onClick={() => loadSession(s.id)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  color: activeSession === s.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  padding: 0,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{s.modelId}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                  <span>{s.messageCount} msgs</span>
                  <span>${(s.costAccumulated || 0).toFixed(4)}</span>
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  padding: 4,
                  opacity: activeSession === s.id ? 1 : 0,
                  transition: 'opacity var(--transition-fast)',
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!activeSession ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-xl)',
              background: 'var(--accent-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Bot size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                FastOps OS
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 300 }}>
                Select a provider and create a session to begin working with your AI team.
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Session header */}
            {activeSessionInfo && (
              <div style={{
                padding: '8px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-secondary)',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Hash size={14} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{activeSessionInfo.modelId}</span>
                  <span className="badge status-active" style={{ fontSize: 9 }}>{activeSessionInfo.status}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Cpu size={11} /> {activeSessionInfo.tokensBurned.toLocaleString()} tokens
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <DollarSign size={11} /> {(activeSessionInfo.costAccumulated || 0).toFixed(4)}
                  </span>
                </div>
              </div>
            )}

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 0',
              }}
            >
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className="fade-in"
                  style={{
                    padding: '12px 24px',
                    borderBottom: '1px solid transparent',
                    background: msg.role === 'user' ? 'transparent' : 'var(--accent-dim)',
                  }}
                >
                  <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    <div style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}>
                      {/* Avatar */}
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--radius-md)',
                        background: msg.role === 'user' ? 'var(--bg-surface)' : 'var(--accent-dim)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 2,
                      }}>
                        {msg.role === 'user'
                          ? <User size={14} style={{ color: 'var(--text-secondary)' }} />
                          : <Bot size={14} style={{ color: 'var(--accent)' }} />
                        }
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 4,
                        }}>
                          <span style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: msg.role === 'user' ? 'var(--text-primary)' : 'var(--accent)',
                          }}>
                            {msg.role === 'user' ? 'You' : 'Agent'}
                          </span>
                          {msg.duration != null && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Clock size={10} />
                              {(msg.duration / 1000).toFixed(1)}s
                            </span>
                          )}
                          {msg.toolCallCount != null && msg.toolCallCount > 0 && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {msg.toolCallCount} tools
                            </span>
                          )}
                          {msg.usage?.cost != null && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              ${msg.usage.cost.toFixed(4)}
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-primary)' }}>
                          {msg.role === 'user' ? (
                            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                          ) : (
                            <>
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code({ className, children, ...props }: any) {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const isBlock = !!match || className?.startsWith('language-');
                                    const language = match ? match[1] : '';
                                    if (isBlock) {
                                      return (
                                        <SyntaxHighlighter
                                          style={vscDarkPlus as any}
                                          language={language}
                                          PreTag="div"
                                          customStyle={{
                                            margin: 0,
                                            padding: 0,
                                            background: 'transparent',
                                            fontSize: 12.5,
                                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                            lineHeight: 1.6,
                                          }}
                                          {...props}
                                        >
                                          {String(children).replace(/\n$/, '')}
                                        </SyntaxHighlighter>
                                      );
                                    }
                                    return (
                                      <code
                                        {...props}
                                        style={{
                                          background: 'var(--bg-surface)',
                                          padding: '1px 5px',
                                          borderRadius: 3,
                                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                          fontSize: '0.88em',
                                          color: 'var(--mauve)',
                                        }}
                                      >
                                        {children}
                                      </code>
                                    );
                                  },
                                  pre({ children }: any) {
                                    return (
                                      <pre style={{
                                        background: 'var(--bg-input)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius-md)',
                                        padding: '14px 16px',
                                        overflowX: 'auto',
                                        margin: '8px 0',
                                      }}>
                                        {children}
                                      </pre>
                                    );
                                  },
                                  p({ children }: any) {
                                    return <p style={{ marginBottom: 10, marginTop: 0 }}>{children}</p>;
                                  },
                                  ul({ children }: any) {
                                    return <ul style={{ paddingLeft: 20, marginBottom: 10, marginTop: 0 }}>{children}</ul>;
                                  },
                                  ol({ children }: any) {
                                    return <ol style={{ paddingLeft: 20, marginBottom: 10, marginTop: 0 }}>{children}</ol>;
                                  },
                                  li({ children }: any) {
                                    return <li style={{ marginBottom: 3 }}>{children}</li>;
                                  },
                                  table({ children }: any) {
                                    return (
                                      <div style={{ overflowX: 'auto', margin: '8px 0' }}>
                                        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                                          {children}
                                        </table>
                                      </div>
                                    );
                                  },
                                  th({ children }: any) {
                                    return (
                                      <th style={{
                                        padding: '6px 10px',
                                        borderBottom: '1px solid var(--border)',
                                        textAlign: 'left',
                                        fontWeight: 600,
                                        color: 'var(--text-secondary)',
                                        fontSize: 11,
                                      }}>
                                        {children}
                                      </th>
                                    );
                                  },
                                  td({ children }: any) {
                                    return (
                                      <td style={{
                                        padding: '6px 10px',
                                        borderBottom: '1px solid var(--border)',
                                      }}>
                                        {children}
                                      </td>
                                    );
                                  },
                                  blockquote({ children }: any) {
                                    return (
                                      <blockquote style={{
                                        borderLeft: '3px solid var(--accent)',
                                        paddingLeft: 14,
                                        margin: '8px 0',
                                        color: 'var(--text-secondary)',
                                      }}>
                                        {children}
                                      </blockquote>
                                    );
                                  },
                                  hr() {
                                    return <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />;
                                  },
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                              {msg.streaming && (
                                <div className="typing-indicator">
                                  <span /><span /><span />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  paddingTop: 80,
                  fontSize: 13,
                }}>
                  Start a conversation.
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div style={{
              padding: '12px 24px 16px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              flexShrink: 0,
            }}>
              <div style={{ maxWidth: 800, margin: '0 auto' }}>
                <div style={{
                  display: 'flex',
                  gap: 8,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '4px 4px 4px 14px',
                  alignItems: 'flex-end',
                  transition: 'border-color var(--transition-fast)',
                }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message your agent... (Enter to send)"
                    rows={1}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      border: 'none',
                      resize: 'none',
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      maxHeight: 150,
                      fontFamily: 'inherit',
                    }}
                    onInput={(e) => {
                      const t = e.currentTarget;
                      t.style.height = 'auto';
                      t.style.height = Math.min(t.scrollHeight, 150) + 'px';
                    }}
                    disabled={sending}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || !input.trim()}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 'var(--radius-md)',
                      background: sending || !input.trim() ? 'transparent' : 'var(--accent)',
                      color: sending || !input.trim() ? 'var(--text-muted)' : 'var(--bg-primary)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {sending ? <Loader2 size={16} className="pulse" /> : <Send size={16} />}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
                  Enter to send · Shift+Enter for newline
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
