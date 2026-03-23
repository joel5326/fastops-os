import fs from 'fs';
import path from 'path';
import type { CompactionArtifact } from '../compaction/types.js';

export interface CompactionStoreOptions {
  baseDir?: string;
}

export class CompactionArtifactStore {
  private baseDir: string;

  constructor(opts?: CompactionStoreOptions) {
    this.baseDir = opts?.baseDir || path.join(process.cwd(), '.fastops-engine', 'compaction-artifacts');
    this.ensureDirectory();
  }

  private ensureDirectory() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getFilePath(sessionId: string): string {
    return path.join(this.baseDir, `${sessionId}.jsonl`);
  }

  /**
   * Serializes a compaction artifact and appends it to the session's artifact log.
   */
  public save(artifact: CompactionArtifact): void {
    const filePath = this.getFilePath(artifact.sessionId);
    const payload = JSON.stringify(artifact);
    
    try {
      fs.appendFileSync(filePath, payload + '\n', { encoding: 'utf-8' });
    } catch (e) {
      console.error(`[CompactionArtifactStore] Failed to save artifact for session ${artifact.sessionId}`, e);
    }
  }

  /**
   * Retrieves all compaction artifacts for a given session, ordered chronologically.
   */
  public loadForSession(sessionId: string): CompactionArtifact[] {
    const filePath = this.getFilePath(sessionId);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const artifacts: CompactionArtifact[] = [];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          artifacts.push(JSON.parse(line));
        } catch (e) {
          console.warn(`[CompactionArtifactStore] Skipped malformed artifact in ${sessionId}.jsonl`);
        }
      }
    } catch (e) {
      console.error(`[CompactionArtifactStore] Failed to read artifacts for session ${sessionId}`, e);
    }

    return artifacts;
  }

  /**
   * Retrieves the most recent compaction artifact for a session, or null if none exist.
   */
  public getLatest(sessionId: string): CompactionArtifact | null {
    const artifacts = this.loadForSession(sessionId);
    if (artifacts.length === 0) return null;
    return artifacts[artifacts.length - 1];
  }
}