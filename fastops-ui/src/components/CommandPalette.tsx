'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Search } from 'lucide-react';

export interface CommandAction {
  id: string;
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  keywords?: string[];
  run: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
}

function fuzzyScore(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 + q.length;

  // Basic ordered-character fuzzy match.
  let qi = 0;
  let score = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 2;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

export default function CommandPalette({ open, onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const ranked = actions
      .map((a) => {
        const haystack = [a.label, a.subtitle ?? '', ...(a.keywords ?? [])].join(' ');
        return { action: a, score: fuzzyScore(query, haystack) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return ranked.map((x) => x.action);
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (selected >= filtered.length) {
      setSelected(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selected]);

  if (!open) return null;

  const runSelected = async () => {
    const picked = filtered[selected];
    if (!picked) return;
    await picked.run();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 90,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(680px, 92vw)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-input)',
          }}
        >
          <Search size={15} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, Math.max(0, filtered.length - 1)));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelected((s) => Math.max(0, s - 1));
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSelected();
              }
            }}
            placeholder="Type a command..."
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 13,
            }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Esc</span>
        </div>

        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 12 }}>
              No command found for &quot;{query}&quot;
            </div>
          ) : (
            filtered.map((action, idx) => {
              const Icon = action.icon;
              const active = idx === selected;
              return (
                <button
                  key={action.id}
                  onClick={() => {
                    setSelected(idx);
                    void runSelected();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    textAlign: 'left',
                    background: active ? 'var(--bg-hover)' : 'transparent',
                    color: 'var(--text-primary)',
                    padding: '10px 12px',
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={15} style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{action.label}</div>
                    {action.subtitle && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {action.subtitle}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

