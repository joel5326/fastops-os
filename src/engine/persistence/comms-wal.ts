import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type { CommsMessage } from '../comms/types.js';
import { InMemoryCommsBus } from '../comms/bus.js';

export interface CommsWALOptions {
  logPath?: string;
}

export class CommsWAL {
  private logPath: string;
  
  constructor(opts?: CommsWALOptions) {
    this.logPath = opts?.logPath || path.join(process.cwd(), '.fastops', 'data', 'comms-bus.jsonl');
    this.ensureDirectory();
  }

  private ensureDirectory() {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Appends a message to the Write-Ahead Log
   */
  public append(msg: CommsMessage): void {
    const payload = JSON.stringify(msg);
    try {
      fs.appendFileSync(this.logPath, payload + '\n', { encoding: 'utf-8' });
    } catch (e) {
      console.error(`[CommsWAL] Failed to append message to WAL at ${this.logPath}`, e);
    }
  }

  /**
   * Reads the WAL from disk and returns all messages.
   * Useful for hydrating the InMemoryCommsBus on boot.
   */
  public async hydrate(): Promise<CommsMessage[]> {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }

    const messages: CommsMessage[] = [];
    const fileStream = fs.createReadStream(this.logPath);
    
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        // Revive the date object
        if (parsed.ts) {
          parsed.ts = new Date(parsed.ts);
        }
        messages.push(parsed as CommsMessage);
      } catch (e) {
        console.error(`[CommsWAL] Failed to parse WAL line: ${line}`, e);
      }
    }

    return messages;
  }

  /**
   * Helper to attach WAL to an InMemoryCommsBus and hydrate it.
   */
  public static async attach(bus: InMemoryCommsBus, logPath?: string): Promise<CommsWAL> {
    const wal = new CommsWAL({ logPath });
    const messages = await wal.hydrate();
    
    if (messages.length > 0) {
      bus.loadHistory(messages);
    }

    bus.setOnPersist((msg: CommsMessage) => {
      wal.append(msg);
    });

    return wal;
  }
}
