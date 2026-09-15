import { expect } from 'chai';
import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import { createVscodeMock } from '../helpers/vscodeMock';

type NpmScriptArg = {
  name: string;
  command: string;
  packageJsonPath: string;
  packageManager: string;
};

const script: NpmScriptArg = {
  name: 'dev',
  command: 'vite',
  packageJsonPath: '/workspace/package.json',
  packageManager: 'npm',
};

function loadPicker(vscodeMock: ReturnType<typeof createVscodeMock>) {
  const keys = proxyquire.noCallThru()('../../shortcuts/scriptShortcutKeys', {});
  return proxyquire.noCallThru()('../../shortcuts/scriptShortcutPicker', {
    vscode: vscodeMock,
    '../common/types': {},
    './scriptShortcutKeys': keys,
  }) as {
    promptSetNpmScriptShortcut: (
      item: NpmScriptArg,
      packageKey: string,
      store: {
        getMap: () => Record<string, { packageKey: string; scriptName: string; source: string }>;
        listUserBindings: () => Array<{ key: string; command: string }>;
        assign: sinon.SinonStub;
        clearForScript: sinon.SinonStub;
      },
    ) => Promise<'assigned' | 'cleared' | 'cancelled'>;
  };
}

function createStore(map: Record<string, { packageKey: string; scriptName: string; source: string }> = {}) {
  return {
    getMap: () => ({ ...map }),
    listUserBindings: () => [] as Array<{ key: string; command: string }>,
    assign: sinon.stub().resolves(),
    clearForScript: sinon.stub().resolves(),
  };
}

describe('scriptShortcutPicker', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('assigns a recommended catalog key without confirmation when free', async () => {
    const vscodeMock = createVscodeMock();
    vscodeMock.window.showQuickPick.resolves({
      action: 'key',
      keyId: 'ctrl+alt+f5',
      label: 'Ctrl+Alt+F5',
    });
    const { promptSetNpmScriptShortcut } = loadPicker(vscodeMock);
    const store = createStore();
    const result = await promptSetNpmScriptShortcut(script, '.', store);
    expect(result).to.equal('assigned');
    expect(store.assign.calledWith('ctrl+alt+f5', '.', 'dev')).to.be.true;
    expect(vscodeMock.window.showWarningMessage.called).to.be.false;
  });

  it('clears the current shortcut', async () => {
    const vscodeMock = createVscodeMock();
    vscodeMock.window.showQuickPick.resolves({ action: 'clear' });
    const { promptSetNpmScriptShortcut } = loadPicker(vscodeMock);
    const store = createStore({
      'ctrl+alt+f5': { packageKey: '.', scriptName: 'dev', source: 'catalog' },
    });
    const result = await promptSetNpmScriptShortcut(script, '.', store);
    expect(result).to.equal('cleared');
    expect(store.clearForScript.calledWith('.', 'dev')).to.be.true;
  });

  it('confirms before replacing another script binding', async () => {
    const vscodeMock = createVscodeMock({ warningMessageResponses: ['Bind anyway'] });
    vscodeMock.window.showQuickPick.resolves({
      action: 'key',
      keyId: 'ctrl+alt+f5',
    });
    const { promptSetNpmScriptShortcut } = loadPicker(vscodeMock);
    const store = createStore({
      'ctrl+alt+f5': { packageKey: 'pkg', scriptName: 'build', source: 'catalog' },
    });
    const result = await promptSetNpmScriptShortcut(script, '.', store);
    expect(result).to.equal('assigned');
    expect(vscodeMock.window.showWarningMessage.calledOnce).to.be.true;
  });

  it('rejects reserved custom keys in validateInput and assigns a free custom key', async () => {
    const vscodeMock = createVscodeMock({ inputBoxResponses: ['ctrl+shift+b'] });
    vscodeMock.window.showQuickPick.resolves({ action: 'custom' });
    const { promptSetNpmScriptShortcut } = loadPicker(vscodeMock);
    const store = createStore();
    const result = await promptSetNpmScriptShortcut(script, '.', store);
    expect(result).to.equal('assigned');
    expect(store.assign.calledWith('ctrl+shift+b', '.', 'dev')).to.be.true;

    const validate = vscodeMock.window.showInputBox.firstCall.args[0].validateInput as (
      value: string,
    ) => string | undefined;
    expect(validate('alt+f4')).to.equal('Alt+F4 closes the window');
    expect(validate('f4')).to.equal('Reserved by JS Runner (Run File)');
    expect(validate('ctrl+k ctrl+s')).to.include('Chords');
    expect(validate('ctrl+shift+b')).to.equal(undefined);
  });

  it('asks before binding a default-occupied custom key and can cancel', async () => {
    const vscodeMock = createVscodeMock({ inputBoxResponses: ['ctrl+s'] });
    vscodeMock.window.showQuickPick.resolves({ action: 'custom' });
    const { promptSetNpmScriptShortcut } = loadPicker(vscodeMock);
    const store = createStore();
    const result = await promptSetNpmScriptShortcut(script, '.', store);
    expect(result).to.equal('cancelled');
    expect(store.assign.called).to.be.false;
    expect(vscodeMock.window.showWarningMessage.calledOnce).to.be.true;
  });
});
