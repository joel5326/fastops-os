'use client';

import { useState, useEffect } from 'react';
import { apiClient, type ContractInfo } from '@/lib/api';
import { getSocket } from '@/lib/ws';
import {
  FileCheck,
  Filter,
  ArrowRight,
  User,
  Link,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Circle,
  Eye,
  Loader2,
} from 'lucide-react';

const STATUS_META: Record<string, { color: string; icon: typeof Circle; label: string }> = {
  OPEN: { color: 'var(--text-muted)', icon: Circle, label: 'Open' },
  CLAIMED: { color: 'var(--yellow)', icon: User, label: 'Claimed' },
  IN_PROGRESS: { color: 'var(--accent)', icon: Loader2, label: 'In Progress' },
  BUILT: { color: 'var(--orange)', icon: Package, label: 'Built' },
  QC_REVIEW: { color: 'var(--yellow)', icon: Eye, label: 'QC Review' },
  QC_PASS: { color: 'var(--green)', icon: CheckCircle2, label: 'QC Pass' },
  QC_FAIL: { color: 'var(--red)', icon: XCircle, label: 'QC Fail' },
  VALIDATION: { color: 'var(--mauve)', icon: Eye, label: 'Validation' },
  VALIDATION_FAIL: { color: 'var(--red)', icon: XCircle, label: 'Val Fail' },
  DONE: { color: 'var(--green)', icon: CheckCircle2, label: 'Done' },
  BLOCKED: { color: 'var(--red)', icon: AlertTriangle, label: 'Blocked' },
};

export default function ContractsView() {
  const [contracts, setContracts] = useState<ContractInfo[]>([]);
  const [selected, setSelected] = useState<ContractInfo | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('ALL');

  const refresh = async () => {
    try {
      const c = await apiClient.listContracts();
      setContracts(c);
    } catch {}
  };

  useEffect(() => {
    refresh();
    const socket = getSocket();
    const events = ['contract.claimed', 'contract.started', 'contract.built', 'contract.qc', 'contract.validated'];
    const unsubs = events.map((ev) => socket.on(ev, refresh));
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!selected) return;
    apiClient.getContract(selected.id)
      .then((full: any) => setAudit(full.auditTrail || []))
      .catch(() => setAudit([]));
  }, [selected?.id]);

  const filtered = filter === 'ALL' ? contracts : contracts.filter((c) => c.status === filter);
  const statuses = ['ALL', ...new Set(contracts.map((c) => c.status))];

  const pipelineStages = ['OPEN', 'CLAIMED', 'IN_PROGRESS', 'BUILT', 'QC_REVIEW', 'QC_PASS', 'VALIDATION', 'DONE'];
  const stageCounts = pipelineStages.map((s) => ({
    stage: s,
    count: contracts.filter((c) => c.status === s).length,
    meta: STATUS_META[s],
  }));
  const totalContracts = contracts.length || 1;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Contract list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', minWidth: 0 }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <FileCheck size={18} style={{ color: 'var(--accent)' }} />
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Contract Pipeline</h1>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {contracts.length} total
            </span>
          </div>

          {/* Pipeline visualization */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 14, height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-hover)' }}>
            {stageCounts.map((s) => (
              <div key={s.stage} style={{
                width: `${(s.count / totalContracts) * 100}%`,
                minWidth: s.count > 0 ? 4 : 0,
                height: '100%',
                background: s.count > 0 ? s.meta?.color || 'var(--border)' : 'transparent',
                transition: 'width 300ms ease',
              }} title={`${s.meta?.label || s.stage}: ${s.count}`} />
            ))}
          </div>

          {/* Stage legend */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {stageCounts.filter((s) => s.count > 0).map((s) => (
              <div key={s.stage} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                color: 'var(--text-muted)',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.meta?.color }} />
                {s.meta?.label} ({s.count})
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                style={{
                  padding: '4px 10px',
                  background: filter === s ? 'var(--bg-hover)' : 'transparent',
                  color: filter === s ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: `1px solid ${filter === s ? 'var(--border-active)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                }}
              >
                {s === 'ALL' ? 'All' : STATUS_META[s]?.label || s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No contracts matching filter.
            </div>
          )}
          {filtered.map((c) => {
            const meta = STATUS_META[c.status] || { color: 'var(--text-muted)', icon: Circle, label: c.status };
            const Icon = meta.icon;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 16px',
                  background: selected?.id === c.id ? 'var(--bg-hover)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: selected?.id === c.id ? '2px solid var(--accent)' : '2px solid transparent',
                  textAlign: 'left',
                  transition: 'background var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{c.id}</span>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: `${meta.color}15`,
                    color: meta.color,
                    fontWeight: 600,
                  }}>
                    <Icon size={10} />
                    {meta.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{c.name}</div>
                {c.claimedBy && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 10 }}>
                    {c.claimedBy && <span>Builder: {c.claimedBy}</span>}
                    {c.qcBy && <span>QC: {c.qcBy}</span>}
                    {c.validatedBy && <span>Val: {c.validatedBy}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ width: 360, overflowY: 'auto', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        {!selected ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <FileCheck size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Select a contract to view details
            </div>
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px' }}>{selected.id}</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{selected.name}</p>
            </div>

            {/* Status */}
            <div style={{ marginBottom: 16 }}>
              <div className="metric-label" style={{ marginBottom: 6 }}>Status</div>
              {(() => {
                const meta = STATUS_META[selected.status] || { color: 'var(--text-muted)', icon: Circle, label: selected.status };
                const Icon = meta.icon;
                return (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 12,
                    padding: '4px 12px',
                    borderRadius: 10,
                    background: `${meta.color}15`,
                    color: meta.color,
                    fontWeight: 600,
                  }}>
                    <Icon size={12} />
                    {meta.label}
                  </span>
                );
              })()}
            </div>

            {/* Roles */}
            {(selected.claimedBy || selected.qcBy || selected.validatedBy) && (
              <div style={{ marginBottom: 16 }}>
                <div className="metric-label" style={{ marginBottom: 6 }}>Assignment</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {selected.claimedBy && (
                    <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                      <User size={12} style={{ color: 'var(--text-muted)' }} /> Builder: <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{selected.claimedBy}</span>
                    </div>
                  )}
                  {selected.qcBy && (
                    <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                      <Eye size={12} style={{ color: 'var(--text-muted)' }} /> QC: <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{selected.qcBy}</span>
                    </div>
                  )}
                  {selected.validatedBy && (
                    <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                      <CheckCircle2 size={12} style={{ color: 'var(--text-muted)' }} /> Validator: <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{selected.validatedBy}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dependencies */}
            {selected.dependencies.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="metric-label" style={{ marginBottom: 6 }}>Dependencies</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {selected.dependencies.map((d) => (
                    <span key={d} style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                    }}>
                      <Link size={9} /> {d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Artifacts */}
            {selected.artifacts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="metric-label" style={{ marginBottom: 6 }}>Artifacts</div>
                {selected.artifacts.map((a) => (
                  <div key={a} style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--mauve)',
                    fontFamily: "'JetBrains Mono', monospace",
                    marginBottom: 2,
                  }}>
                    {a}
                  </div>
                ))}
              </div>
            )}

            {/* Audit Trail */}
            <div>
              <div className="metric-label" style={{ marginBottom: 6 }}>Audit Trail</div>
              {audit.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>No audit entries</div>
              ) : (
                <div style={{
                  borderTop: '1px solid var(--border)',
                }}>
                  {audit.map((entry, i) => (
                    <div key={i} style={{
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>{entry.action}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(entry.ts).toLocaleTimeString('en-US', { hour12: false })}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {entry.model}: {entry.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
