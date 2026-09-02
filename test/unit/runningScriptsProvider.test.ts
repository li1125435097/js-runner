import { expect } from 'chai';
import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import { DEFAULT_INTERPRETERS } from '../helpers/constants';
import { loadRunningScriptsProviderModule } from '../helpers/loadModules';
import { createVscodeMock } from '../helpers/vscodeMock';

describe('RunningScriptsProvider', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('reflects running scripts from TerminalManager', () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': DEFAULT_INTERPRETERS },
    });
    const { TerminalManager, RunningScriptsProvider } = loadRunningScriptsProviderModule(vscodeMock);
    const terminalManager = new TerminalManager();
    const provider = new RunningScriptsProvider(terminalManager);

    terminalManager.runFile('/workspace/a.js', 'javascript', 'new');
    terminalManager.runNpmScript('build', '/workspace/package.json');

    const children = provider.getChildren();
    expect(children).to.have.length(2);
    expect(children.map((item: { label?: string }) => item.label)).to.include.members(['a.js', 'build']);
    provider.dispose();
    terminalManager.dispose();
  });

  it('fires tree change when running scripts change', () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': DEFAULT_INTERPRETERS },
    });
    const { TerminalManager, RunningScriptsProvider } = loadRunningScriptsProviderModule(vscodeMock);
    const terminalManager = new TerminalManager();
    const provider = new RunningScriptsProvider(terminalManager);
    const listener = sinon.spy();

    provider.onDidChangeTreeData(listener);
    terminalManager.runFile('/workspace/a.js', 'javascript', 'new');

    expect(listener.called).to.be.true;
    provider.dispose();
    terminalManager.dispose();
  });

  it('returns tree item unchanged from getTreeItem', () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': DEFAULT_INTERPRETERS },
    });
    const { TerminalManager, RunningScriptsProvider } = loadRunningScriptsProviderModule(vscodeMock);
    const terminalManager = new TerminalManager();
    const provider = new RunningScriptsProvider(terminalManager);
    terminalManager.runFile('/workspace/a.js', 'javascript', 'new');
    const [item] = provider.getChildren();

    expect(provider.getTreeItem(item)).to.equal(item);
    provider.dispose();
    terminalManager.dispose();
  });
});
