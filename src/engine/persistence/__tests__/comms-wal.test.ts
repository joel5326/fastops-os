import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommsWAL } from '../comms-wal.js';
import { InMemoryCommsBus } from '../../comms/bus.js';
import type { CommsMessage } from '../../comms/types.js';

describe('CommsWAL', () => {
  const testLogPath = path.join(__dirname, 'test-comms-bus.jsonl');

  beforeEach(() => {
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
  });

  it('should create the directory if it does not exist', () => {
    const customPath = path.join(__dirname, 'nested', 'test-comms-bus.jsonl');
    new CommsWAL({ logPath: customPath });
    expect(fs.existsSync(path.dirname(customPath))).toBe(true);
    
    // cleanup
    if (fs.existsSync(customPath)) fs.unlinkSync(customPath);
    if (fs.existsSync(path.dirname(customPath))) fs.rmdirSync(path.dirname(customPath));
  });

  it('should append messages to the WAL file', async () => {
    const wal = new CommsWAL({ logPath: testLogPath });
    
    const msg: CommsMessage = {
      id: 'msg-1',
      from: 'test-model',
      channel: 'general',
      content: 'Hello WAL',
      ts: new Date('2026-03-22T10:00:00Z'),
    };

    wal.append(msg);

    expect(fs.existsSync(testLogPath)).toBe(true);
    const content = fs.readFileSync(testLogPath, 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.id).toBe('msg-1');
    expect(parsed.content).toBe('Hello WAL');
  });

  it('should hydrate messages from the WAL file', async () => {
    const wal = new CommsWAL({ logPath: testLogPath });
    
    const msg1: CommsMessage = {
      id: 'msg-1',
      from: 'test-model',
      channel: 'general',
      content: 'Hello WAL 1',
      ts: new Date('2026-03-22T10:00:00Z'),
    };

    const msg2: CommsMessage = {
      id: 'msg-2',
      from: 'test-model',
      channel: 'general',
      content: 'Hello WAL 2',
      ts: new Date('2026-03-22T10:01:00Z'),
    };

    wal.append(msg1);
    wal.append(msg2);

    const hydrated = await wal.hydrate();
    expect(hydrated.length).toBe(2);
    expect(hydrated[0].id).toBe('msg-1');
    expect(hydrated[1].id).toBe('msg-2');
    expect(hydrated[0].ts instanceof Date).toBe(true);
  });

  it('should attach to an InMemoryCommsBus and auto-append new messages', async () => {
    const bus = new InMemoryCommsBus();
    const wal = await CommsWAL.attach(bus, testLogPath);

    bus.send({
      from: 'model-a',
      channel: 'general',
      content: 'Auto-appended message'
    });

    const content = fs.readFileSync(testLogPath, 'utf-8');
    const parsed = JSON.parse(content.trim());
    
    expect(parsed.content).toBe('Auto-appended message');
    expect(parsed.from).toBe('model-a');
  });

  it('should hydrate an InMemoryCommsBus correctly upon attach', async () => {
    // First, populate the log file
    const wal1 = new CommsWAL({ logPath: testLogPath });
    wal1.append({
      id: 'old-1',
      from: 'model-b',
      channel: 'ops',
      content: 'Old message',
      ts: new Date()
    });

    // Then, create a new bus and attach it
    const bus = new InMemoryCommsBus();
    await CommsWAL.attach(bus, testLogPath);

    const history = bus.getHistory('ops');
    expect(history.length).toBe(1);
    expect(history[0].content).toBe('Old message');
  });
});
