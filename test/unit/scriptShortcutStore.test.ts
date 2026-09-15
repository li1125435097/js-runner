import { expect } from 'chai';
import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import { createVscodeMock } from '../helpers/vscodeMock';

function createWorkspaceState(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      return key in store ? (store[key] as T) : defaultValue;
    },
    async update(key: string, value: unknown): Promise<void> {
      store[key] = value;
    },
    store,
  };
}

type KeybindingsAdapter = {
  read: () => string | undefined;
  write: (text: string) => void;
};

function loadStore(vscodeMock: ReturnType<typeof createVscodeMock>, adapter: KeybindingsAdapter) {
  const keys = proxyquire.noCallThru()('../../shortcuts/scriptShortcutKeys', {});
  const file = proxyquire.noCallThru()('../../shortcuts/userKeybindingsFile', {
    './scriptShortcutKeys': keys,
  });
  const { ScriptShortcutStore } = proxyquire.noCallThru()('../../shortcuts/scriptShortcutStore', {
    vscode: vscodeMock,
    './scriptShortcutKeys': keys,
    './userKeybindingsFile': {
      ...file,
      createFsKeybindingsAdapter: () => adapter,
      resolveUserKeybindingsPath: () => '/tmp/keybindings.json',
    },
  }) as {
    ScriptShortcutStore: new (
      state: ReturnType<typeof createWorkspaceState>,
      fileAdapter?: KeybindingsAdapter,
    ) => {
      getMap: () => Record<string, { packageKey: string; scriptName: string; source: string }>;
      assign: (keyId: string, packageKey: string, scriptName: string) => Promise<void>;
      clearForScript: (packageKey: string, scriptName: string) => Promise<void>;
      activate: () => Promise<void>;
      dispose: () => void;
    };
  };
  return { ScriptShortcutStore };
}

describe('scriptShortcutStore', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('assigns catalog keys with context and does not write custom file entries', async () => {
    const vscodeMock = createVscodeMock();
    const writes: string[] = [];
    const adapter = {
      read: () => '[]',
      write: (text: string) => {
        writes.push(text);
      },
    };
    const { ScriptShortcutStore } = loadStore(vscodeMock, adapter);
    const state = createWorkspaceState();
    const store = new ScriptShortcutStore(state, adapter);

    await store.assign('ctrl+alt+f5', '.', 'dev');
    expect(store.getMap()['ctrl+alt+f5']).to.deep.include({
      packageKey: '.',
      scriptName: 'dev',
      source: 'catalog',
    });
    expect(
      vscodeMock.commands.executeCommand.calledWith(
        'setContext',
        'jsRunner.shortcut.ctrlAltF5',
        true,
      ),
    ).to.be.true;
    expect(writes.some((text) => text.includes('ctrl+alt+f5'))).to.be.false;
  });

  it('writes custom keys, replaces previous binding, and clears context', async () => {
    const vscodeMock = createVscodeMock();
    let contents = '[]';
    const adapter = {
      read: () => contents,
      write: (text: string) => {
        contents = text;
      },
    };
    const { ScriptShortcutStore } = loadStore(vscodeMock, adapter);
    const store = new ScriptShortcutStore(createWorkspaceState(), adapter);

    await store.assign('ctrl+shift+b', '.', 'dev');
    expect(store.getMap()['ctrl+shift+b']?.source).to.equal('custom');
    expect(contents).to.include('ctrl+shift+b');
    expect(contents).to.include('jsRunner.shortcut.ctrlShiftB');

    await store.assign('ctrl+alt+f5', '.', 'dev');
    expect(store.getMap()['ctrl+shift+b']).to.equal(undefined);
    expect(store.getMap()['ctrl+alt+f5']?.source).to.equal('catalog');
    expect(contents).to.not.include('ctrl+shift+b');
    expect(
      vscodeMock.commands.executeCommand.calledWith(
        'setContext',
        'jsRunner.shortcut.ctrlShiftB',
        false,
      ),
    ).to.be.true;

    await store.clearForScript('.', 'dev');
    expect(store.getMap()).to.deep.equal({});
  });
});
