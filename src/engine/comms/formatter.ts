import type { CommsMessage, CommsFlag } from './types.js';

export function formatMessage(msg: CommsMessage): string {
  const time = msg.ts.toLocaleTimeString('en-US', { hour12: false });
  const prefix = msg.flags?.includes('urgent') ? '[URGENT] ' : '';
  const channel = `#${msg.channel}`;
  return `[${time}] ${prefix}${msg.from} (${channel}): ${msg.content}`;
}

export function formatMessageCompact(msg: CommsMessage): string {
  const time = msg.ts.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  return `[${time}] ${msg.from}: ${msg.content}`;
}

export function detectFlags(content: string): CommsFlag[] {
  const flags: CommsFlag[] = [];

  if (/\bURGENT\b|\bCRITICAL\b|\bBLOCKER\b/i.test(content)) {
    flags.push('urgent');
  }

  if (/\bBLOCK(ED|ER|ING)\b/i.test(content)) {
    flags.push('blocker');
  }

  if (/\bQC\b.*\b(REQUEST|REQUIRED|NEEDED)\b/i.test(content)) {
    flags.push('qc-request');
  }

  if (/\bCLAIM(ED|ING)?\b/i.test(content)) {
    flags.push('claim');
  }

  if (/\bSTATUS\b.*\b(UPDATE|CHECK|REPORT)\b/i.test(content)) {
    flags.push('status');
  }

  if (/\bLAST MAN TAP\b|\bTAPPED?\b/i.test(content)) {
    flags.push('tap');
  }

  return [...new Set(flags)];
}

export function isCommsOutput(modelOutput: string): boolean {
  return /\bOver\.\s*$|\bOut\.\s*$/m.test(modelOutput) &&
         /^(COMMANDER|STATUS|ACK|REPORT|LAST MAN TAP)/m.test(modelOutput);
}

export function extractCommsContent(modelOutput: string): string | null {
  const match = modelOutput.match(
    /^(COMMANDER|STATUS|ACK|REPORT|LAST MAN TAP)[\s\S]*?(?:Over\.|Out\.)\s*$/m
  );
  return match ? match[0] : null;
}
