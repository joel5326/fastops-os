'use client';

import { useState, useEffect } from 'react';
import { apiClient, type ContractInfo } from '@/lib/api';
import { getSocket } from '@/lib/ws';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'var(--text-muted)',
  CLAIMED: 'var(--yellow)',
  IN_PROGRESS: 'var(--accent)',
  BUILT: 'var(--orange)',
  QC_REVIEW: 'var(--yellow)',
  QC_PASS: 'var(--green)',
  QC_FAIL: 'var(--red)',
  VALIDATION: 'var(--yellow)',
  VALIDATION_FAIL: 'var(--red)',
  DONE: 'var(--green)',
  BLOCKED: 'var(--red)',
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
    } catch { /* offline */ }
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
  }));

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Contract list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Contract Pipeline</h1>

          {/* Pipeline visualization */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
            {stageCounts.map((s) => (
              <div key={s.stage} style={{
                flex: Math.max(s.count, 0.5),
                height: 6,
                borderRadius: 3,
                background: s.count > 0 ? STATUS_COLORS[s.stage] || 'var(--border)' : 'var(--bg-surface)',
                transition: 'flex 0.3s',
              }} title={`${s.stage}: ${s.count}`} />
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
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                {s} {s !== 'ALL' && `(${contracts.filter((c) => c.status === s).length})`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map((c) => (
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
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{c.id}</span>
                <span style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: `${STATUS_COLORS[c.status] || 'var(--border)'}20`,
                  color: STATUS_COLORS[c.status] || 'var(--text-muted)',
                  fontWeight: 600,
                }}>
                  {c.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{c.name}</div>
              {c.claimedBy && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Builder: {c.claimedBy}
                  {c.qcBy && ` · QC: ${c.qcBy}`}
                  {c.validatedBy && ` · Val: ${c.validatedBy}`}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ width: 360, overflowY: 'auto', padding: 16, background: 'var(--bg-secondary)' }}>
        {!selected ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
            Select a contract to view details
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{selected.id}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>{selected.name}</p>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>STATUS</div>
              <span style={{
                fontSize: 12,
                padding: '4px 12px',
                borderRadius: 10,
                background: `${STATUS_COLORS[selected.status]}20`,
                color: STATUS_COLORS[selected.status],
                fontWeight: 600,
              }}>
                {selected.status}
              </span>
            </div>

            {selected.dependencies.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>DEPENDS ON</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {selected.dependencies.map((d) => (
                    <span key={d} style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      background: 'var(--bg-surface)',
                      borderRadius: 4,
                      color: 'var(--text-secondary)',
                    }}>{d}</span>
                  ))}
                </div>
              </div>
            )}

            {selected.artifacts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>ARTIFACTS</div>
                {selected.artifacts.map((a) => (
                  <div key={a} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a}</div>
                ))}
              </div>
            )}

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>AUDIT TRAIL</div>
              {audit.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No audit entries</div>
              )}
              {audit.map((entry, i) => (
                <div key={i} style={{
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{entry.action}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                      {new Date(entry.ts).toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                    {entry.model}: {entry.reason}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
