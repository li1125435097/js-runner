import * as sinon from 'sinon';

export class MockEventEmitter<T = void> {
  private listeners: Array<(event: T) => void> = [];

  readonly event = (listener: (event: T) => void): { dispose: () => void } => {
    this.listeners.push(listener);
    return { dispose: () => this.off(listener) };
  };

  fire(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners = [];
  }

  private off(listener: (event: T) => void): void {
    this.listeners = this.listeners.filter((item) => item !== listener);
  }
}

export class MockTreeItem {
  label?: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  iconPath?: unknown;
  command?: unknown;
  collapsibleState?: number;

  constructor(label?: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class MockThemeIcon {
  constructor(public readonly id: string) {}
}

export interface MockTerminal {
  name: string;
  show: sinon.SinonStub;
  sendText: sinon.SinonStub;
  dispose: sinon.SinonStub;
}

export function createMockTerminal(name = 'mock-terminal'): MockTerminal {
  return {
    name,
    show: sinon.stub(),
    sendText: sinon.stub(),
    dispose: sinon.stub(),
  };
}

export interface VscodeMockOptions {
  workspaceFolders?: Array<{ uri: { fsPath: string }; name: string }>;
  workspaceFiles?: Array<{ fsPath: string }>;
  configuration?: Record<string, unknown>;
  activeTextEditor?: {
    document: {
      fileName: string;
      languageId: string;
    };
  };
  inputBoxResponses?: Array<string | undefined>;
  warningMessageResponses?: Array<string | undefined>;
}

export interface VscodeMock {
  TreeItem: typeof MockTreeItem;
  ThemeIcon: typeof MockThemeIcon;
  TreeItemCollapsibleState: { None: number; Collapsed: number; Expanded: number };
  EventEmitter: typeof MockEventEmitter;
  ConfigurationTarget: { Global: number; Workspace: number; WorkspaceFolder: number };
  Uri: {
    file: (filePath: string) => { fsPath: string; toString: () => string };
    parse: (url: string) => { fsPath: string; toString: () => string };
  };
  env: {
    openExternal: sinon.SinonStub;
  };
  workspace: {
    workspaceFolders: Array<{ uri: { fsPath: string }; name: string }>;
    getWorkspaceFolder: (uri: { fsPath: string }) => { uri: { fsPath: string }; name: string } | undefined;
    findFiles: sinon.SinonStub;
    createFileSystemWatcher: sinon.SinonStub;
    onDidChangeWorkspaceFolders: (listener: () => void) => { dispose: () => void };
    onDidChangeConfiguration: (listener: (event: { affectsConfiguration: (key: string) => boolean }) => void) => { dispose: () => void };
    getConfiguration: sinon.SinonStub;
    __emitConfigurationChange: (section: string) => void;
  };
  window: {
    activeTextEditor?: {
      document: {
        fileName: string;
        languageId: string;
      };
    };
    createTerminal: sinon.SinonStub;
    onDidCloseTerminal: (listener: (terminal: MockTerminal) => void) => { dispose: () => void };
    showInputBox: sinon.SinonStub;
    showWarningMessage: sinon.SinonStub;
    showErrorMessage: sinon.SinonStub;
    __createdTerminals: MockTerminal[];
    __closeTerminal: (terminal: MockTerminal) => void;
  };
  commands: {
    executeCommand: sinon.SinonStub;
    registerCommand: sinon.SinonStub;
  };
  debug: {
    startDebugging: sinon.SinonStub;
  };
  __configurationStore: Map<string, unknown>;
}

export function createVscodeMock(options: VscodeMockOptions = {}): VscodeMock {
  const configurationStore = new Map<string, unknown>(
    Object.entries(options.configuration ?? {}),
  );
  let inputBoxIndex = 0;
  let warningMessageIndex = 0;
  const createdTerminals: MockTerminal[] = [];
  const closeTerminalListeners: Array<(terminal: MockTerminal) => void> = [];

  const workspaceFolderListener = new MockEventEmitter<void>();
  const configChangeEmitter = new MockEventEmitter<{ affectsConfiguration: (key: string) => boolean }>();

  const mock = {
    TreeItem: MockTreeItem,
    ThemeIcon: MockThemeIcon,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    EventEmitter: MockEventEmitter,
    ConfigurationTarget: {
      Global: 1,
      Workspace: 2,
      WorkspaceFolder: 3,
    },
    Uri: {
      file: (filePath: string) => ({
        fsPath: filePath,
        toString: () => filePath,
      }),
      parse: (url: string) => ({
        fsPath: url,
        toString: () => url,
      }),
    },
    env: {
      openExternal: sinon.stub().resolves(true),
    },
    workspace: {
      workspaceFolders: options.workspaceFolders ?? [],
      getWorkspaceFolder: (uri: { fsPath: string }) => {
        const folders = options.workspaceFolders ?? [];
        return (
          folders.find((folder) => uri.fsPath.startsWith(folder.uri.fsPath)) ??
          folders[0]
        );
      },
      findFiles: sinon.stub().resolves(options.workspaceFiles ?? []),
      createFileSystemWatcher: sinon.stub().returns({
        onDidChange: sinon.stub(),
        onDidCreate: sinon.stub(),
        onDidDelete: sinon.stub(),
        dispose: sinon.stub(),
      }),
      onDidChangeWorkspaceFolders: workspaceFolderListener.event.bind(workspaceFolderListener),
      onDidChangeConfiguration: configChangeEmitter.event.bind(configChangeEmitter),
      getConfiguration: sinon.stub().callsFake((section?: string) => ({
        get: <T>(key: string, defaultValue?: T): T => {
          const fullKey = section ? `${section}.${key}` : key;
          if (configurationStore.has(fullKey)) {
            return configurationStore.get(fullKey) as T;
          }
          return defaultValue as T;
        },
        update: sinon.stub().callsFake(async (key: string, value: unknown) => {
          const fullKey = section ? `${section}.${key}` : key;
          configurationStore.set(fullKey, value);
        }),
        inspect: <T>(key: string) => {
          const fullKey = section ? `${section}.${key}` : key;
          if (!configurationStore.has(fullKey)) {
            return undefined;
          }
          return { globalValue: configurationStore.get(fullKey) as T };
        },
      })),
      __emitConfigurationChange: (section: string) => {
        configChangeEmitter.fire({
          affectsConfiguration: (key: string) => key === section || section.startsWith(key),
        });
      },
    },
    window: {
      activeTextEditor: options.activeTextEditor,
      createTerminal: sinon.stub().callsFake((opts: { name?: string }) => {
        const terminal = createMockTerminal(opts?.name);
        createdTerminals.push(terminal);
        return terminal;
      }),
      onDidCloseTerminal: (listener: (terminal: MockTerminal) => void) => {
        closeTerminalListeners.push(listener);
        return { dispose: () => {} };
      },
      showInputBox: sinon.stub().callsFake(async () => {
        const response = options.inputBoxResponses?.[inputBoxIndex];
        inputBoxIndex += 1;
        return response;
      }),
      showWarningMessage: sinon.stub().callsFake(async () => {
        const response = options.warningMessageResponses?.[warningMessageIndex];
        warningMessageIndex += 1;
        return response;
      }),
      showErrorMessage: sinon.stub().resolves(undefined),
      __createdTerminals: createdTerminals,
      __closeTerminal: (terminal: MockTerminal) => {
        for (const listener of closeTerminalListeners) {
          listener(terminal);
        }
      },
    },
    commands: {
      executeCommand: sinon.stub().resolves(undefined),
      registerCommand: sinon.stub().returns({ dispose: sinon.stub() }),
    },
    debug: {
      startDebugging: sinon.stub().resolves(true),
    },
    __configurationStore: configurationStore,
  };

  return mock as VscodeMock;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
