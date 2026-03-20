import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { CommsMessage } from './types.js';

export class JsonlExporter {
  private filePath: string;

  constructor(exportDir: string, channel?: string) {
    if (!existsSync(exportDir)) {
      mkdirSync(exportDir, { recursive: true });
    }
    this.filePath = join(exportDir, channel ? `${channel}.jsonl` : 'all.jsonl');
  }

  append(msg: CommsMessage): void {
    const row = {
      id: msg.id,
      from: msg.from,
      channel: msg.channel,
      content: msg.content,
      ts: msg.ts.toISOString(),
      flags: msg.flags,
      replyTo: msg.replyTo,
      metadata: msg.metadata,
    };
    appendFileSync(this.filePath, JSON.stringify(row) + '\n', 'utf8');
  }

  readAll(): CommsMessage[] {
    if (!existsSync(this.filePath)) return [];

    const raw = readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];

    return raw.split(/\r?\n/).filter(Boolean).map((line) => {
      const parsed = JSON.parse(line);
      return {
        ...parsed,
        ts: new Date(parsed.ts),
      };
    });
  }

  getPath(): string {
    return this.filePath;
  }
}

export class DailyRotatingExporter {
  private exportDir: string;
  private currentDate: string = '';
  private currentExporter?: JsonlExporter;

  constructor(exportDir: string) {
    this.exportDir = exportDir;
    if (!existsSync(exportDir)) {
      mkdirSync(exportDir, { recursive: true });
    }
  }

  append(msg: CommsMessage): void {
    const dateStr = msg.ts.toISOString().split('T')[0];

    if (dateStr !== this.currentDate) {
      this.currentDate = dateStr;
      this.currentExporter = new JsonlExporter(this.exportDir, `audit-${dateStr}`);
    }

    this.currentExporter!.append(msg);
  }
}
