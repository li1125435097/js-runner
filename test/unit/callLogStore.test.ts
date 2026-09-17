import { expect } from 'chai';
import * as proxyquire from 'proxyquire';

type CallLogStoreCtor = new (maxEntries: number) => {
  getSize: () => number;
  setMaxEntries: (max: number) => void;
  append: (entry: {
    timestamp: number;
    tool: string;
    arguments: unknown;
    status: 'ok' | 'error';
    durationMs: number;
    error?: string;
  }) => unknown;
  list: (options?: { offset?: number; limit?: number; tool?: string }) => {
    total: number;
    entries: Array<{ tool: string; arguments: unknown }>;
  };
};

function loadStore(): CallLogStoreCtor {
  return proxyquire.noCallThru()('../../mcp/callLogStore', {}).CallLogStore as CallLogStoreCtor;
}

describe('CallLogStore', () => {
  it('drops oldest entries when the limit is exceeded', () => {
    const CallLogStore = loadStore();
    const store = new CallLogStore(3);
    store.append({ timestamp: 1, tool: 'a', arguments: {}, status: 'ok', durationMs: 1 });
    store.append({ timestamp: 2, tool: 'b', arguments: {}, status: 'ok', durationMs: 1 });
    store.append({ timestamp: 3, tool: 'c', arguments: {}, status: 'ok', durationMs: 1 });
    store.append({ timestamp: 4, tool: 'd', arguments: {}, status: 'ok', durationMs: 1 });

    expect(store.getSize()).to.equal(3);
    const page = store.list({ limit: 10 });
    expect(page.entries.map((entry) => entry.tool)).to.deep.equal(['d', 'c', 'b']);
  });

  it('trims immediately when the max is lowered', () => {
    const CallLogStore = loadStore();
    const store = new CallLogStore(10);
    for (let i = 0; i < 5; i += 1) {
      store.append({ timestamp: i, tool: `t${i}`, arguments: {}, status: 'ok', durationMs: 1 });
    }
    store.setMaxEntries(2);
    expect(store.getSize()).to.equal(2);
    expect(store.list({ limit: 10 }).entries.map((entry) => entry.tool)).to.deep.equal(['t4', 't3']);
  });

  it('filters by tool and paginates newest first', () => {
    const CallLogStore = loadStore();
    const store = new CallLogStore(100);
    store.append({ timestamp: 1, tool: 'keep', arguments: { n: 1 }, status: 'ok', durationMs: 1 });
    store.append({ timestamp: 2, tool: 'skip', arguments: {}, status: 'error', durationMs: 2, error: 'nope' });
    store.append({ timestamp: 3, tool: 'keep', arguments: { n: 2 }, status: 'ok', durationMs: 3 });

    const page = store.list({ tool: 'keep', offset: 0, limit: 1 });
    expect(page.total).to.equal(2);
    expect(page.entries).to.have.length(1);
    expect(page.entries[0].arguments).to.deep.equal({ n: 2 });
  });
});
