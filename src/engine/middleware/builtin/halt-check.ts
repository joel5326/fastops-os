import { existsSync } from 'fs';
import { join } from 'path';
import type { Middleware, MiddlewareContext, MiddlewareResult } from '../types.js';

export class HaltCheckMiddleware implements Middleware {
  readonly name = 'halt-check';
  readonly priority = 0;
  readonly removable = false;
  private haltFilePath: string;

  constructor(workingDirectory: string) {
    this.haltFilePath = join(workingDirectory, '.fastops', '.halt');
  }

  onRequest(_ctx: MiddlewareContext): MiddlewareResult {
    if (existsSync(this.haltFilePath)) {
      return { action: 'block', reason: 'Kill switch is active (.fastops/.halt file exists). All operations halted.' };
    }
    return { action: 'continue' };
  }
}
