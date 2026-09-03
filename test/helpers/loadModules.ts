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

  const packageManagerConfig = proxyquire.noCallThru()('../../packageManager/packageManagerConfig', {
    vscode: vscodeMock,
  });

  return proxyquire.noCallThru()('../../packageManager/packageManager', {
    vscode: vscodeMock,
    './packageManagerConfig': packageManagerConfig,
  });
}

export function loadTypesModule(vscodeMock: VscodeMock) {
  return proxyquire.noCallThru()('../../common/types', { vscode: vscodeMock });
}

export function loadInterpreterConfigModule(vscodeMock: VscodeMock) {
  return proxyquire.noCallThru()('../../interpreter/interpreterConfig', { vscode: vscodeMock });
}

export function loadTerminalManagerModule(
  vscodeMock: VscodeMock,
  interpreterConfig: ReturnType<typeof loadInterpreterConfigModule>,
) {
  const packageManager = createPackageManagerStub(vscodeMock);
  const npmScriptDebug = proxyquire.noCallThru()('../../terminal/npmScriptDebug', {
    vscode: vscodeMock,
    '../packageManager/packageManager': packageManager,
  });
  return proxyquire.noCallThru()('../../terminal/terminalManager', {
    vscode: vscodeMock,
    '../interpreter/interpreterConfig': interpreterConfig,
    '../packageManager/packageManager': packageManager,
    './npmScriptDebug': npmScriptDebug,
    '../common/htmlFileOpener': proxyquire.noCallThru()('../../common/htmlFileOpener', {
      vscode: vscodeMock,
    }),
  }).TerminalManager;
}

export function loadNpmScriptsProviderModule(vscodeMock: VscodeMock, fs: typeof import('fs')) {
  const packageManager = createPackageManagerStub(vscodeMock);
  return proxyquire.noCallThru()('../../providers/npmScriptsProvider', {
    vscode: vscodeMock,
    '../common/types': loadTypesModule(vscodeMock),
    '../packageManager/packageManager': packageManager,
    '../packageManager/packageManagerConfig': proxyquire.noCallThru()('../../packageManager/packageManagerConfig', {
      vscode: vscodeMock,
    }),
    '../packageManager/registryConfig': proxyquire.noCallThru()('../../packageManager/registryConfig', {}),
    fs,
  }) as {
    NpmScriptsProvider: new () => {
      getChildren: (element?: unknown) => unknown[];
      refresh: () => void;
      dispose: () => void;
      setGroupExpanded: (packageJsonPath: string, expanded: boolean) => void;
      onDidChangeTreeData: (listener: (element: unknown) => void) => { dispose: () => void };
    };
    isInsideNodeModules: (fsPath: string) => boolean;
    SCAN_DEBOUNCE_MS: number;
  };
}

export function loadRunningScriptsProviderModule(vscodeMock: VscodeMock) {
  const interpreterConfig = loadInterpreterConfigModule(vscodeMock);
  const TerminalManager = loadTerminalManagerModule(vscodeMock, interpreterConfig);

  return {
    TerminalManager,
    RunningScriptsProvider: proxyquire.noCallThru()('../../providers/runningScriptsProvider', {
      vscode: vscodeMock,
      '../common/types': loadTypesModule(vscodeMock),
      '../terminal/terminalManager': { TerminalManager },
    }).RunningScriptsProvider,
  };
}

export function loadLanguageInterpretersProviderModule(vscodeMock: VscodeMock) {
  const interpreterConfig = loadInterpreterConfigModule(vscodeMock);
  const types = loadTypesModule(vscodeMock);

  return {
    LanguageInterpretersProvider: proxyquire.noCallThru()('../../providers/languageInterpretersProvider', {
      vscode: vscodeMock,
      '../interpreter/interpreterConfig': interpreterConfig,
      '../common/types': types,
    }).LanguageInterpretersProvider,
    LanguageInterpreterTreeItem: types.LanguageInterpreterTreeItem,
  };
}

export function loadNpmScriptDebugModule(vscodeMock: VscodeMock) {
  const packageManager = createPackageManagerStub(vscodeMock);
  return proxyquire.noCallThru()('../../terminal/npmScriptDebug', {
    vscode: vscodeMock,
    '../packageManager/packageManager': packageManager,
  });
}
