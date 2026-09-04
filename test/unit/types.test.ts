import { expect } from 'chai';
import { loadTypesModule } from '../helpers/loadModules';
import { createMockTerminal, createVscodeMock } from '../helpers/vscodeMock';

function loadTypes(vscodeMock: ReturnType<typeof createVscodeMock>) {
  return loadTypesModule(vscodeMock) as {
    PackageGroupItem: new (
      group: {
        packageJsonPath: string;
        label: string;
        scripts: unknown[];
      },
      expanded?: boolean,
      pinned?: boolean,
    ) => {
      label?: string;
      contextValue?: string;
      tooltip?: string;
      collapsibleState?: number;
      id?: string;
      iconPath?: { id?: string; color?: { id: string }; scheme?: string };
      resourceUri?: { scheme: string; toString: () => string };
    };
    ScriptSearchItem: new (query: string) => {
      label?: string;
      description?: string;
      contextValue?: string;
      command?: unknown;
    };
    ScriptTreeItem: new (
      script: {
        name: string;
        command: string;
        packageJsonPath: string;
        packageManager: string;
      },
      pinned?: boolean,
    ) => {
      label?: string;
      description?: string;
      contextValue?: string;
      command?: unknown;
      id?: string;
      iconPath?: { id: string; color?: { id: string } };
      resourceUri?: { scheme: string; toString: () => string };
    };
    LanguageInterpreterTreeItem: new (interpreter: {
      languageId: string;
      label?: string;
      path: string;
    }) => { label?: string; description?: string; contextValue?: string };
    RunningScriptTreeItem: new (runningScript: {
      id: string;
      terminal: ReturnType<typeof createMockTerminal>;
      name: string;
      type: 'js' | 'npm';
      filePath?: string;
    }) => { label?: string; description?: string; contextValue?: string; command?: unknown };
  };
}

describe('types tree items', () => {
  it('creates package group tree item with package context', () => {
    const vscodeMock = createVscodeMock();
    const { PackageGroupItem } = loadTypes(vscodeMock);

    const item = new PackageGroupItem({
      packageJsonPath: '/workspace/package.json',
      label: 'workspace',
      scripts: [],
    });

    expect(item.label).to.equal('workspace');
    expect(item.contextValue).to.equal('packageGroup');
    expect(item.tooltip).to.equal('/workspace/package.json');
    expect(item.collapsibleState).to.equal(vscodeMock.TreeItemCollapsibleState.Collapsed);
    expect(item.id).to.equal('package-group:/workspace/package.json');
    expect(item.iconPath?.id).to.equal('package');
    expect(item.iconPath?.color).to.equal(undefined);

    const expanded = new PackageGroupItem(
      {
        packageJsonPath: '/workspace/package.json',
        label: 'workspace',
        scripts: [],
      },
      true,
    );
    expect(expanded.collapsibleState).to.equal(vscodeMock.TreeItemCollapsibleState.Expanded);

    const pinned = new PackageGroupItem(
      {
        packageJsonPath: '/workspace/package.json',
        label: 'workspace',
        scripts: [],
      },
      false,
      true,
    );
    expect(pinned.contextValue).to.equal('packageGroupPinned');
    expect(pinned.iconPath?.scheme).to.equal('data');
    expect(String(pinned.iconPath)).to.include(encodeURIComponent('#46ee37'));
    expect(pinned.resourceUri?.scheme).to.equal('js-runner-pin');
  });

  it('creates npm script tree item wired to run command', () => {
    const vscodeMock = createVscodeMock();
    const { ScriptTreeItem } = loadTypes(vscodeMock);
    const script = {
      name: 'build',
      command: 'tsc',
      packageJsonPath: '/workspace/package.json',
      packageManager: 'npm',
    };
    const item = new ScriptTreeItem(script);

    expect(item.label).to.equal('build');
    expect(item.description).to.equal('tsc');
    expect(item.id).to.equal('script:/workspace/package.json:build');
    expect(item.contextValue).to.equal('npmScriptJs');
    expect(item.command).to.deep.include({
      command: 'jsRunner.runNpmScript',
      arguments: [script],
    });
  });

  it('marks non-js npm scripts without debug context', () => {
    const vscodeMock = createVscodeMock();
    const { ScriptTreeItem } = loadTypes(vscodeMock);
    const script = {
      name: 'lint',
      command: 'echo lint',
      packageJsonPath: '/workspace/package.json',
      packageManager: 'pnpm',
    };
    const item = new ScriptTreeItem(script);

    expect(item.contextValue).to.equal('npmScript');
  });

  it('creates search row with empty and active query labels', () => {
    const vscodeMock = createVscodeMock();
    const { ScriptSearchItem } = loadTypes(vscodeMock);

    const empty = new ScriptSearchItem('');
    expect(empty.label).to.equal('Search package path...');
    expect(empty.description).to.equal(undefined);
    expect(empty.contextValue).to.equal('npmScriptSearch');
    expect(empty.command).to.deep.include({ command: 'jsRunner.filterNpmScripts' });

    const filtered = new ScriptSearchItem('build');
    expect(filtered.label).to.equal('build');
    expect(filtered.description).to.equal('Click to edit');
  });

  it('marks pinned npm scripts with pinned context', () => {
    const vscodeMock = createVscodeMock();
    const { ScriptTreeItem } = loadTypes(vscodeMock);

    const jsItem = new ScriptTreeItem(
      {
        name: 'build',
        command: 'tsc',
        packageJsonPath: '/workspace/package.json',
        packageManager: 'npm',
      },
      true,
    );
    expect(jsItem.contextValue).to.equal('npmScriptJsPinned');
    expect(jsItem.iconPath?.color?.id).to.equal('jsRunner.pinnedForeground');
    expect(jsItem.resourceUri?.scheme).to.equal('js-runner-pin');

    const otherItem = new ScriptTreeItem(
      {
        name: 'lint',
        command: 'echo lint',
        packageJsonPath: '/workspace/package.json',
        packageManager: 'pnpm',
      },
      true,
    );
    expect(otherItem.contextValue).to.equal('npmScriptPinned');
  });

  it('creates language interpreter tree item', () => {
    const vscodeMock = createVscodeMock();
    const { LanguageInterpreterTreeItem } = loadTypes(vscodeMock);
    const interpreter = { languageId: 'python', label: 'Python', path: 'python' };
    const item = new LanguageInterpreterTreeItem(interpreter);

    expect(item.label).to.equal('Python');
    expect(item.description).to.equal('python');
    expect(item.contextValue).to.equal('languageInterpreter');
  });

  it('creates running script tree item with focus command', () => {
    const vscodeMock = createVscodeMock();
    const { RunningScriptTreeItem } = loadTypes(vscodeMock);
    const terminal = createMockTerminal('js: hello.js');
    const runningScript = {
      id: '1',
      terminal,
      name: 'hello.js',
      type: 'js' as const,
      filePath: '/workspace/hello.js',
    };
    const item = new RunningScriptTreeItem(runningScript);

    expect(item.label).to.equal('hello.js');
    expect(item.description).to.equal('JS');
    expect(item.contextValue).to.equal('runningScript');
    expect(item.command).to.deep.include({
      command: 'jsRunner.focusRunningTerminal',
      arguments: ['1'],
    });
  });
});
