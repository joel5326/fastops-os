import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ToolHandler } from './types.js';
import { resolveSandboxedPath } from './path-policy.js';

function resolvePath(filePath: string, context: { workingDirectory: string; sandboxRoot: string }): string {
  return resolveSandboxedPath(String(filePath), context.workingDirectory, context.sandboxRoot);
}

export const readFile: ToolHandler = async (args, context) => {
  const path = resolvePath(String(args.path), context);
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }

  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');

  const startLine = typeof args.startLine === 'number' ? args.startLine - 1 : 0;
  const endLine = typeof args.endLine === 'number' ? args.endLine : lines.length;

  return lines.slice(startLine, endLine).map((l, i) => `${i + startLine + 1}|${l}`).join('\n');
};

export const writeFile: ToolHandler = async (args, context) => {
  const path = resolvePath(String(args.path), context);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(path, String(args.content), 'utf8');
  return `File written: ${path}`;
};

export const editFile: ToolHandler = async (args, context) => {
  const path = resolvePath(String(args.path), context);
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }

  const content = readFileSync(path, 'utf8');
  const oldString = String(args.oldString);
  const newString = String(args.newString);
  const replaceAll = Boolean(args.replaceAll);

  if (!content.includes(oldString)) {
    const lines = content.split('\n');
    const similar = lines
      .map((l, i) => ({ line: l.trim(), num: i + 1 }))
      .filter((l) => l.line.length > 0)
      .map((l) => ({ ...l, similarity: stringSimilarity(l.line, oldString.trim()) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);

    throw new Error(
      `String not found in file. Did you mean:\n` +
      similar.map((s) => `  Line ${s.num}: ${s.line}`).join('\n'),
    );
  }

  const updated = replaceAll
    ? content.split(oldString).join(newString)
    : content.replace(oldString, newString);

  writeFileSync(path, updated, 'utf8');

  const count = replaceAll
    ? (content.split(oldString).length - 1)
    : 1;
  return `Replaced ${count} occurrence(s) in ${path}`;
};

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
}
