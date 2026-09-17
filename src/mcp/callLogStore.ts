/**
 * MCP 调用记录环形队列：超限丢弃最旧条目。
 */

export interface McpCallLog {
  id: string;
  timestamp: number;
  tool: string;
  arguments: unknown;
  status: 'ok' | 'error';
  durationMs: number;
  result?: unknown;
  error?: string;
}

export interface CallLogListOptions {
  offset?: number;
  limit?: number;
  tool?: string;
}

export interface CallLogPage {
  total: number;
  offset: number;
  limit: number;
  entries: McpCallLog[];
}

export class CallLogStore {
  private entries: McpCallLog[] = [];
  private maxEntries: number;
  private nextId = 1;
  private readonly listeners = new Set<() => void>();

  constructor(maxEntries: number) {
    this.maxEntries = Math.max(1, Math.trunc(maxEntries) || 1);
  }

  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  setMaxEntries(maxEntries: number): void {
    this.maxEntries = Math.max(1, Math.trunc(maxEntries) || 1);
    this.trim();
  }

  getMaxEntries(): number {
    return this.maxEntries;
  }

  getSize(): number {
    return this.entries.length;
  }

  append(entry: Omit<McpCallLog, 'id'>): McpCallLog {
    const stored: McpCallLog = {
      ...entry,
      id: String(this.nextId++),
    };
    this.entries.push(stored);
    this.trim();
    this.emitChange();
    return stored;
  }

  list(options: CallLogListOptions = {}): CallLogPage {
    const tool = options.tool?.trim();
    const filtered = tool
      ? this.entries.filter((entry) => entry.tool === tool)
      : this.entries;
    const newestFirst = filtered.slice().reverse();
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.max(1, options.limit ?? 100);
    return {
      total: newestFirst.length,
      offset,
      limit,
      entries: newestFirst.slice(offset, offset + limit),
    };
  }

  clear(): void {
    this.entries = [];
    this.emitChange();
  }

  private trim(): void {
    if (this.entries.length <= this.maxEntries) {
      return;
    }
    this.entries.splice(0, this.entries.length - this.maxEntries);
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
