import { expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import { DEFAULT_INTERPRETERS } from '../helpers/constants';
import { loadTerminalManagerModule } from '../helpers/loadModules';
import { createMockTerminal, createVscodeMock } from '../helpers/vscodeMock';

function loadTerminalManager(vscodeMock: ReturnType<typeof createVscodeMock>) {
  const interpreterConfig = {
    getInterpreterForLanguage: (languageId: string) =>
      DEFAULT_INTERPRETERS.find((item) => item.languageId === languageId),
  };
  return loadTerminalManagerModule(vscodeMock, interpreterConfig) as new () => {
    runFile(filePath: string, languageId: string, mode: 'replace' | 'new'): void;
    runCurrentFile(mode: 'replace' | 'new'): void;
    runNpmScript(name: string, packageJsonPath: string): void;
    stopAll(): void;
    getRunningScripts(): Array<{ id: string; type: string; terminal: ReturnType<typeof createMockTerminal> }>;
    dispose(): void;
  };
}

describe('TerminalManager', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('opens html files in the system default browser without creating a terminal', async () => {
    const vscodeMock = createVscodeMock();
    const TerminalManager = loadTerminalManager(vscodeMock);
    const manager = new TerminalManager();
    const filePath = path.join('C:', 'workspace', 'Hello.html');

    manager.runFile(filePath, 'html', 'new');

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vscodeMock.window.__createdTerminals as unknown[]).to.be.empty;
    expect(vscodeMock.env.openExternal.calledOnce).to.be.true;
    expect(vscodeMock.env.openExternal.firstCall.args[0].toString()).to.match(/^file:\/\//);
  });

  it('runs a configured file in a new terminal', () => {
    const vscodeMock = createVscodeMock();
    const TerminalManager = loadTerminalManager(vscodeMock);
    const manager = new TerminalManager();
    const filePath = path.join('C:', 'workspace', 'hello.js');

    manager.runFile(filePath, 'javascript', 'new');

    const terminals = vscodeMock.window.__createdTerminals as ReturnType<typeof createMockTerminal>[];
    expect(terminals).to.have.length(1);
    expect(terminals[0].show.calledOnce).to.be.true;
    expect(terminals[0].sendText.firstCall.args[0]).to.equal(`node "${filePath}"`);
    expect(manager.getRunningScripts()).to.have.length(1);
    expect(manager.getRunningScripts()[0].type).to.equal('js');
  });

  it('shows warning when language has no interpreter', () => {
    const vscodeMock = createVscodeMock();
    const TerminalManager = loadTerminalManager(vscodeMock);
    const manager = new TerminalManager();

    manager.runFile('/tmp/unknown.rb', 'ruby', 'new');

    expect(vscodeMock.window.showWarningMessage.calledOnce).to.be.true;
    expect(manager.getRunningScripts()).to.be.empty;
  });

  it('replace mode stops previous terminals for the same file', () => {
    const vscodeMock = createVscodeMock();
    const TerminalManager = loadTerminalManager(vscodeMock);
    const manager = new TerminalManager();
    const filePath = '/workspace/hello.js';

    manager.runFile(filePath, 'javascript', 'new');
    manager.runFile(filePath, 'javascript', 'replace');

    const terminals = vscodeMock.window.__createdTerminals as ReturnType<typeof createMockTerminal>[];
    expect(terminals[0].dispose.calledOnce).to.be.true;
    expect(manager.getRunningScripts()).to.have.length(1);
    expect(manager.getRunningScripts()[0].terminal).to.equal(terminals[1]);
  });

  it('runs npm scripts in package directory', () => {
    const vscodeMock = createVscodeMock();
    const TerminalManager = loadTerminalManager(vscodeMock);
    const manager = new TerminalManager();
    const packageJsonPath = path.join('C:', 'workspace', 'package.json');

    manager.runNpmScript('build', packageJsonPath);

    const terminals = vscodeMock.window.__createdTerminals as ReturnType<typeof createMockTerminal>[];
    expect(terminals[0].sendText.firstCall.args[0]).to.equal('npm run build');
    expect(manager.getRunningScripts()[0].type).to.equal('npm');
  });

  it('stopAll disposes every tracked terminal', () => {
    const vscodeMock = createVscodeMock();
    const TerminalManager = loadTerminalManager(vscodeMock);
    const manager = new TerminalManager();

    manager.runFile('/workspace/a.js', 'javascript', 'new');
    manager.runNpmScript('build', '/workspace/package.json');
    manager.stopAll();

    const terminals = vscodeMock.window.__createdTerminals as ReturnType<typeof createMockTerminal>[];
    expect(terminals.every((terminal) => terminal.dispose.called)).to.be.true;
    expect(manager.getRunningScripts()).to.be.empty;
  });

  it('removes script when terminal is closed manually', () => {
    const vscodeMock = createVscodeMock();
    const TerminalManager = loadTerminalManager(vscodeMock);
    const manager = new TerminalManager();

    manager.runFile('/workspace/a.js', 'javascript', 'new');
    const [terminal] = vscodeMock.window.__createdTerminals as ReturnType<typeof createMockTerminal>[];
    vscodeMock.window.__closeTerminal(terminal);

    expect(manager.getRunningScripts()).to.be.empty;
  });

  it('runCurrentFile exits early without active editor', () => {
    const vscodeMock = createVscodeMock({ activeTextEditor: undefined });
    const TerminalManager = loadTerminalManager(vscodeMock);
    const manager = new TerminalManager();

    manager.runCurrentFile('new');

    expect(vscodeMock.window.__createdTerminals as unknown[]).to.be.empty;
  });
});
