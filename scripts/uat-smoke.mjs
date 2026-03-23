#!/usr/bin/env node

/**
 * FastOps OS UAT smoke runner.
 *
 * Usage:
 *   node scripts/uat-smoke.mjs
 *   FASTOPS_BASE_URL=http://localhost:3100 node scripts/uat-smoke.mjs
 */

const BASE_URL = process.env.FASTOPS_BASE_URL || 'http://localhost:3100';
const API_BASE = `${BASE_URL.replace(/\/$/, '')}/api`;

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function requestJson(path, init) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for debugging in smoke output.
  }
  return { url, status: res.status, ok: res.ok, json, text };
}

/**
 * @param {string} name
 * @param {() => Promise<void>} fn
 */
async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`FAIL: ${name} -> ${msg}`);
    return false;
  }
}

/**
 * @param {unknown} condition
 * @param {string} message
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`Running UAT smoke against ${API_BASE}`);

  let createdSessionId = null;
  const results = [];

  results.push(await check('GET /health', async () => {
    const res = await requestJson('/health');
    assert(res.ok, `status ${res.status}`);
    assert(res.json && res.json.status === 'ok', 'expected { status: "ok" }');
  }));

  results.push(await check('GET /adapters', async () => {
    const res = await requestJson('/adapters');
    assert(res.ok, `status ${res.status}`);
    assert(res.json && Array.isArray(res.json.available), 'expected adapters.available array');
    assert(res.json.available.length > 0, 'no adapters available');
  }));

  results.push(await check('POST /sessions', async () => {
    const adapters = await requestJson('/adapters');
    assert(adapters.ok && adapters.json, 'failed to load adapters');
    const modelId = adapters.json.available[0];
    assert(modelId, 'no modelId available for session create');

    const res = await requestJson('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId }),
    });
    assert(res.ok, `status ${res.status} body: ${res.text}`);
    assert(res.json && typeof res.json.id === 'string', 'missing session id in response');
    createdSessionId = res.json.id;
  }));

  results.push(await check('GET /sessions', async () => {
    const res = await requestJson('/sessions');
    assert(res.ok, `status ${res.status}`);
    assert(Array.isArray(res.json), 'expected sessions array');
  }));

  results.push(await check('GET /contracts', async () => {
    const res = await requestJson('/contracts');
    assert(res.ok, `status ${res.status}`);
    assert(Array.isArray(res.json), 'expected contracts array');
  }));

  if (createdSessionId) {
    results.push(await check('DELETE /sessions/:id', async () => {
      const res = await requestJson(`/sessions/${createdSessionId}`, { method: 'DELETE' });
      assert(res.ok, `status ${res.status}`);
      assert(res.json && res.json.success === true, 'expected success=true');
    }));
  }

  const passed = results.filter(Boolean).length;
  const total = results.length;
  console.log(`UAT smoke summary: ${passed}/${total} checks passed`);

  if (passed !== total) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  console.error(`UAT smoke runner crashed: ${msg}`);
  process.exitCode = 1;
});

