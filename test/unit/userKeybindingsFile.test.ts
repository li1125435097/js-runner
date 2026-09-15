import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as proxyquire from 'proxyquire';

function loadFileModule() {
  const keys = proxyquire.noCallThru()('../../shortcuts/scriptShortcutKeys', {});
  return proxyquire.noCallThru()('../../shortcuts/userKeybindingsFile', {
    './scriptShortcutKeys': keys,
  }) as {
    resolveUserKeybindingsPath: (
      appName: string,
      env?: NodeJS.ProcessEnv,
      platform?: NodeJS.Platform,
    ) => string;
    userDataFolderName: (appName: string) => string;
    parseKeybindingsJsonc: (text: string) => unknown[];
    listUserKeybindings: (adapter: { read: () => string | undefined; write: (text: string) => void }) => Array<{
      key: string;
      command: string;
    }>;
    createFsKeybindingsAdapter: (filePath: string) => {
      read: () => string | undefined;
      write: (text: string) => void;
    };
    reconcileShortcutKeybindings: (entries: unknown[], customKeyIds: string[]) => unknown[];
    applyShortcutKeybindingsReconcile: (
      adapter: { read: () => string | undefined; write: (text: string) => void },
      customKeyIds: string[],
    ) => void;
  };
}

describe('userKeybindingsFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-runner-keys-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves Cursor and Code user keybindings paths', () => {
    const {
      resolveUserKeybindingsPath,
      userDataFolderName,
    } = loadFileModule();
    expect(userDataFolderName('Cursor')).to.equal('Cursor');
    expect(userDataFolderName('Visual Studio Code')).to.equal('Code');
    expect(userDataFolderName('Visual Studio Code - Insiders')).to.equal('Code - Insiders');
    expect(
      resolveUserKeybindingsPath('Cursor', { APPDATA: 'C:\\AppData' }, 'win32').replace(/\\/g, '/'),
    ).to.equal('C:/AppData/Cursor/User/keybindings.json');
  });

  it('parses JSONC keybindings and lists user commands', () => {
    const { parseKeybindingsJsonc, listUserKeybindings, createFsKeybindingsAdapter } =
      loadFileModule();
    const parsed = parseKeybindingsJsonc(`[
      // comment
      { "key": "ctrl+shift+b", "command": "workbench.action.toggleSidebarVisibility" },
    ]`);
    expect(parsed).to.have.length(1);

    const filePath = path.join(tempDir, 'keybindings.json');
    fs.writeFileSync(
      filePath,
      `[
        { "key": "ctrl+p", "command": "workbench.action.quickOpen" }
      ]`,
    );
    expect(listUserKeybindings(createFsKeybindingsAdapter(filePath))).to.deep.equal([
      { key: 'ctrl+p', command: 'workbench.action.quickOpen' },
    ]);
  });

  it('upserts custom shortcut entries and prunes removed ones', () => {
    const {
      reconcileShortcutKeybindings,
      applyShortcutKeybindingsReconcile,
      createFsKeybindingsAdapter,
      parseKeybindingsJsonc,
    } = loadFileModule();

    const existing = [
      { key: 'ctrl+s', command: 'workbench.action.files.save' },
      {
        key: 'ctrl+shift+b',
        command: 'jsRunner.runNpmScriptByShortcut',
        args: { keyId: 'ctrl+shift+b' },
        when: 'jsRunner.shortcut.ctrlShiftB',
      },
    ];
    const next = reconcileShortcutKeybindings(existing, ['ctrl+shift+n']);
    expect(next.some((entry) => (entry as { key?: string }).key === 'ctrl+s')).to.be.true;
    expect(
      next.some(
        (entry) => (entry as { args?: { keyId?: string } }).args?.keyId === 'ctrl+shift+b',
      ),
    ).to.be.false;
    expect(
      next.some(
        (entry) => (entry as { args?: { keyId?: string } }).args?.keyId === 'ctrl+shift+n',
      ),
    ).to.be.true;

    const filePath = path.join(tempDir, 'keybindings.json');
    const adapter = createFsKeybindingsAdapter(filePath);
    applyShortcutKeybindingsReconcile(adapter, ['ctrl+shift+b']);
    const written = parseKeybindingsJsonc(fs.readFileSync(filePath, 'utf8'));
    expect(written).to.deep.equal([
      {
        key: 'ctrl+shift+b',
        command: 'jsRunner.runNpmScriptByShortcut',
        args: { keyId: 'ctrl+shift+b' },
        when: 'jsRunner.shortcut.ctrlShiftB',
      },
    ]);

    applyShortcutKeybindingsReconcile(adapter, []);
    expect(parseKeybindingsJsonc(fs.readFileSync(filePath, 'utf8'))).to.deep.equal([]);
  });
});
