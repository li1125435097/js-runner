import * as proxyquire from 'proxyquire';
import { VscodeMock } from './vscodeMock';

function createPackageManagerStub(vscodeMock: VscodeMock) {
  return loadPackageManagerModule(vscodeMock);
}

export function loadPackageManagerModule(
  vscodeMock: VscodeMock,
  configuration: Record<string, unknown> = {},
) {
  for (const [key, value] of Object.entries(configuration)) {
    vscodeMock.__configurationStore.set(key, value);
  }

  const packageManagerConfig = proxyquire.noCallThru()('../../packageManagerConfig', {
    vscode: vscodeMock,
  });

  return proxyquire.noCallThru()('../../packageManager', {
    vscode: vscodeMock,
    './packageManagerConfig': packageManagerConfig,
  });
}

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
  const packageManager = createPackageManagerStub(vscodeMock);
  const npmScriptDebug = proxyquire.noCallThru()('../../npmScriptDebug', {
    vscode: vscodeMock,
    './packageManager': packageManager,
  });
  return proxyquire.noCallThru()('../../terminalManager', {
    vscode: vscodeMock,
    './interpreterConfig': interpreterConfig,
    './packageManager': packageManager,
    './npmScriptDebug': npmScriptDebug,
    './htmlFileOpener': proxyquire.noCallThru()('../../htmlFileOpener', {
      vscode: vscodeMock,
    }),
  }).TerminalManager;
}

export function loadNpmScriptsProviderModule(vscodeMock: VscodeMock, fs: typeof import('fs')) {
  const packageManager = createPackageManagerStub(vscodeMock);
  return proxyquire.noCallThru()('../../npmScriptsProvider', {
    vscode: vscodeMock,
    './types': loadTypesModule(vscodeMock),
    './packageManager': packageManager,
    './packageManagerConfig': proxyquire.noCallThru()('../../packageManagerConfig', {
      vscode: vscodeMock,
    }),
    './registryConfig': proxyquire.noCallThru()('../../registryConfig', {}),
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

export function loadNpmScriptDebugModule(vscodeMock: VscodeMock) {
  const packageManager = createPackageManagerStub(vscodeMock);
  return proxyquire.noCallThru()('../../npmScriptDebug', {
    vscode: vscodeMock,
    './packageManager': packageManager,
  });
}
