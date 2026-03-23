'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiClient, type EngineSettings, type CostLimits } from '@/lib/api';
import {
  Settings,
  Shield,
  Cpu,
  DollarSign,
  OctagonAlert,
  RefreshCw,
  Save,
  Loader2,
} from 'lucide-react';

const LS_DEFAULT_PROVIDER = 'fastops.defaultProvider';
const LS_DEFAULT_MODEL = 'fastops.defaultModel';

function sectionTitle(icon: ReactNode, label: string) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      {icon}
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{label}</h2>
    </div>
  );
}

export default function SettingsPanel() {
  const [data, setData] = useState<EngineSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingCosts, setSavingCosts] = useState(false);
  const [savingKill, setSavingKill] = useState(false);

  const [costDraft, setCostDraft] = useState<CostLimits>({
    perSessionLimit: 5,
    perHourLimit: 20,
    totalLimit: 100,
  });

  const [defaultProvider, setDefaultProvider] = useState('');
  const [defaultModel, setDefaultModel] = useState('');

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const s = await apiClient.getEngineSettings();
      setData(s);
      setCostDraft(s.costLimits);
      if (typeof window !== 'undefined') {
        setDefaultProvider(localStorage.getItem(LS_DEFAULT_PROVIDER) || s.adapters.available[0] || '');
        setDefaultModel(localStorage.getItem(LS_DEFAULT_MODEL) || '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persistModelDefaults = () => {
    try {
      if (defaultProvider) localStorage.setItem(LS_DEFAULT_PROVIDER, defaultProvider);
      else localStorage.removeItem(LS_DEFAULT_PROVIDER);
      if (defaultModel.trim()) localStorage.setItem(LS_DEFAULT_MODEL, defaultModel.trim());
      else localStorage.removeItem(LS_DEFAULT_MODEL);
    } catch {
      /* ignore */
    }
  };

  const saveCostLimits = async () => {
    setSavingCosts(true);
    setError(null);
    try {
      const res = await apiClient.updateCostLimits(costDraft);
      setCostDraft(res.costLimits);
      if (data) setData({ ...data, costLimits: res.costLimits });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update cost limits');
    } finally {
      setSavingCosts(false);
    }
  };

  const setKillSwitch = async (halted: boolean) => {
    setSavingKill(true);
    setError(null);
    try {
      if (halted) await apiClient.killSwitch();
      else await apiClient.releaseKillSwitch();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kill switch request failed');
    } finally {
      setSavingKill(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 280,
    padding: '8px 10px',
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 12,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginBottom: 4,
    display: 'block',
  };

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: 'var(--text-muted)' }}>
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
        Loading settings…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Settings size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Settings</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Engine configuration, defaults, spend limits, and safety controls
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            fontSize: 11,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {error && (
          <div style={{
            marginBottom: 16,
            padding: '10px 12px',
            background: 'rgba(243, 139, 168, 0.12)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: 'var(--red)',
          }}>
            {error}
          </div>
        )}

        {/* Engine */}
        <section style={{ marginBottom: 28 }}>
          {sectionTitle(<Shield size={16} style={{ color: 'var(--accent)' }} />, 'Engine')}
          <div style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            maxWidth: 720,
          }}>
            <div style={{ marginBottom: 12 }}>
              <span style={labelStyle}>Security tier</span>
              <span style={{
                display: 'inline-block',
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                color: 'var(--text-primary)',
              }}>
                {data?.securityTier ?? '—'}
              </span>
            </div>
            <div>
              <span style={labelStyle}>Adapters (providers)</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {(data?.adapters.available ?? []).map((a) => (
                  <span
                    key={a}
                    style={{
                      padding: '4px 8px',
                      fontSize: 11,
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {a}
                  </span>
                ))}
              </div>
              <span style={{ ...labelStyle, marginTop: 8 }}>Registered models</span>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', maxHeight: 120, overflow: 'auto' }}>
                {(data?.adapters.models ?? []).map((m) => (
                  <div key={`${m.provider}:${m.model}`} style={{ padding: '2px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{m.provider}</span>
                    <span style={{ color: 'var(--border)' }}> / </span>
                    <span>{m.model}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Model defaults (browser) */}
        <section style={{ marginBottom: 28 }}>
          {sectionTitle(<Cpu size={16} style={{ color: 'var(--green)' }} />, 'Model selection defaults')}
          <div style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            maxWidth: 720,
          }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 0, marginBottom: 12 }}>
              Used when opening Chat: new sessions use these defaults (stored in this browser).
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Default provider</label>
              <select
                value={defaultProvider}
                onChange={(e) => setDefaultProvider(e.target.value)}
                style={{ ...inputStyle, maxWidth: 320 }}
              >
                <option value="">— Select —</option>
                {(data?.adapters.available ?? []).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Default model override (optional)</label>
              <input
                type="text"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                placeholder="e.g. claude-3-5-sonnet-20241022"
                style={inputStyle}
              />
            </div>
            <button
              type="button"
              onClick={persistModelDefaults}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 600,
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}
            >
              <Save size={14} />
              Save defaults
            </button>
          </div>
        </section>

        {/* Cost limits */}
        <section style={{ marginBottom: 28 }}>
          {sectionTitle(<DollarSign size={16} style={{ color: 'var(--yellow)' }} />, 'Cost limits')}
          <div style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            maxWidth: 720,
          }}>
            {data && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                Current usage — hourly: ${data.costUsage.hourly.toFixed(2)} · total: ${data.costUsage.total.toFixed(2)}
                {Object.keys(data.costUsage.sessions).length > 0 && (
                  <span> · sessions tracked: {Object.keys(data.costUsage.sessions).length}</span>
                )}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Per session ($)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={costDraft.perSessionLimit}
                  onChange={(e) => setCostDraft((d) => ({ ...d, perSessionLimit: Number(e.target.value) }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Per hour ($)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={costDraft.perHourLimit}
                  onChange={(e) => setCostDraft((d) => ({ ...d, perHourLimit: Number(e.target.value) }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Total engine ($)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={costDraft.totalLimit}
                  onChange={(e) => setCostDraft((d) => ({ ...d, totalLimit: Number(e.target.value) }))}
                  style={inputStyle}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={savingCosts}
              onClick={() => void saveCostLimits()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 600,
                background: savingCosts ? 'var(--bg-hover)' : 'var(--green)',
                color: 'var(--bg-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: savingCosts ? 'wait' : 'pointer',
                opacity: savingCosts ? 0.7 : 1,
              }}
            >
              {savingCosts ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
              Apply limits
            </button>
          </div>
        </section>

        {/* Kill switch */}
        <section style={{ marginBottom: 28 }}>
          {sectionTitle(<OctagonAlert size={16} style={{ color: 'var(--red)' }} />, 'Kill switch')}
          <div style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            border: `1px solid ${data?.halted ? 'var(--red)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-md)',
            maxWidth: 720,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                When enabled, the engine halt flag is set and dispatch is blocked by middleware.
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                Status:{' '}
                <strong style={{ color: data?.halted ? 'var(--red)' : 'var(--green)' }}>
                  {data?.halted ? 'HALTED' : 'Released'}
                </strong>
              </p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: savingKill ? 'wait' : 'pointer' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Halt engine</span>
              <input
                type="checkbox"
                checked={!!data?.halted}
                disabled={savingKill || !data}
                onChange={(e) => void setKillSwitch(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--red)' }}
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
