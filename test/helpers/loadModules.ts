import * as proxyquire from 'proxyquire';
import { VscodeMock } from './vscodeMock';

export function loadTypesModule(vscodeMock: VscodeMock) {
  return proxyquire.noCallThru()('../../types', { vscode: vscodeMock });
}

export function loadInterpreterConfigModule(vscodeMock: VscodeMock) {
  return proxyquire.noCallThru()('../../interpreterConfig', { vscode: vscodeMock });
}

export function loadTerminalManagerModule(
  vscodeMock: VscodeMock,
  interpreterConfig: ReturnType<typeof loadInterpreterConfigModule>,
) {
  return proxyquire.noCallThru()('../../terminalManager', {
    vscode: vscodeMock,
    './interpreterConfig': interpreterConfig,
    './htmlFileOpener': proxyquire.noCallThru()('../../htmlFileOpener', {
      vscode: vscodeMock,
    }),
  }).TerminalManager;
}

export function loadNpmScriptsProviderModule(vscodeMock: VscodeMock, fs: typeof import('fs')) {
  return proxyquire.noCallThru()('../../npmScriptsProvider', {
    vscode: vscodeMock,
    './types': loadTypesModule(vscodeMock),
    fs,
  }).NpmScriptsProvider;
}

export function loadRunningScriptsProviderModule(vscodeMock: VscodeMock) {
  const interpreterConfig = loadInterpreterConfigModule(vscodeMock);
  const TerminalManager = loadTerminalManagerModule(vscodeMock, interpreterConfig);

  return {
    TerminalManager,
    RunningScriptsProvider: proxyquire.noCallThru()('../../runningScriptsProvider', {
      vscode: vscodeMock,
      './types': loadTypesModule(vscodeMock),
      './terminalManager': { TerminalManager },
    }).RunningScriptsProvider,
  };
}

export function loadLanguageInterpretersProviderModule(vscodeMock: VscodeMock) {
  const interpreterConfig = loadInterpreterConfigModule(vscodeMock);
  const types = loadTypesModule(vscodeMock);

  return {
    LanguageInterpretersProvider: proxyquire.noCallThru()('../../languageInterpretersProvider', {
      vscode: vscodeMock,
      './interpreterConfig': interpreterConfig,
      './types': types,
    }).LanguageInterpretersProvider,
    LanguageInterpreterTreeItem: types.LanguageInterpreterTreeItem,
  };
}
