import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { fixtureWorkspaceRoot } from '../helpers/constants';
import { loadNpmScriptsProviderModule } from '../helpers/loadModules';
import { createVscodeMock, wait } from '../helpers/vscodeMock';

const fixtureRoot = fixtureWorkspaceRoot();
const rootPackageJson = path.join(fixtureRoot, 'package.json');
const nestedPackageJson = path.join(fixtureRoot, 'nested', 'pkg', 'package.json');

type TreeNode = {
  label?: string;
  description?: string;
  collapsibleState?: number;
  contextValue?: string;
  id?: string;
  script?: {
    name: string;
    command: string;
    packageJsonPath: string;
    packageManager: string;
  };
};

function normalizeLabel(label: string | undefined): string {
  return (label ?? '').replace(/\\/g, '/');
}

function getPackageGroups(provider: { getChildren: (element?: unknown) => unknown[] }): TreeNode[] {
  return (provider.getChildren() as TreeNode[]).filter(
    (item) => item.contextValue === 'packageGroup' || item.contextValue === 'packageGroupPinned',
  );
}

function getScripts(
  provider: { getChildren: (element?: unknown) => unknown[] },
  group: unknown,
): TreeNode[] {
  return (provider.getChildren(group) as TreeNode[]).filter((item) => Boolean(item.script));
}

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

describe('NpmScriptsProvider', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('matches package paths with case-insensitive substring', () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
    });
    const { matchesPackagePath } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const group = {
      packageJsonPath: nestedPackageJson,
      label: 'workspace/nested/pkg',
    };
    expect(matchesPackagePath(group, '')).to.be.true;
    expect(matchesPackagePath(group, 'NESTED/pkg')).to.be.true;
    expect(matchesPackagePath(group, 'workspace')).to.be.true;
    expect(matchesPackagePath(group, 'missing')).to.be.false;
  });

  it('returns a search row when workspace has no folders', async () => {
    const vscodeMock = createVscodeMock({ workspaceFolders: [] });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(20);
    const roots = provider.getChildren() as TreeNode[];
    expect(roots).to.have.length(1);
    expect(roots[0].label).to.equal('Search package path...');
    expect(roots[0].contextValue).to.equal('npmScriptSearch');
    provider.dispose();
  });

  it('groups npm scripts from discovered package.json files', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }, { fsPath: nestedPackageJson }],
    });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(30);
    const roots = provider.getChildren() as TreeNode[];
    expect(roots[0].label).to.equal('Search package path...');
    const groups = getPackageGroups(provider);
    expect(groups).to.have.length(2);

    const rootGroup = groups.find((item) => item.label === 'workspace');
    expect(rootGroup).to.exist;
    expect(rootGroup?.collapsibleState).to.equal(vscodeMock.TreeItemCollapsibleState.Expanded);
    expect(rootGroup?.id).to.equal(`package-group:${rootPackageJson}`);
    const rootChildren = provider.getChildren(rootGroup) as TreeNode[];
    expect(rootChildren[0].label).to.equal('Package Manager');
    expect(getScripts(provider, rootGroup).map((item) => item.label)).to.include.members([
      'build',
      'start',
      'test',
    ]);

    const nestedGroup = groups.find(
      (item) => normalizeLabel(item.label) === 'workspace/nested/pkg',
    );
    expect(nestedGroup).to.exist;
    expect(nestedGroup?.collapsibleState).to.equal(vscodeMock.TreeItemCollapsibleState.Collapsed);
    expect(nestedGroup?.id).to.equal(`package-group:${nestedPackageJson}`);
    const nestedChildren = provider.getChildren(nestedGroup) as TreeNode[];
    expect(nestedChildren[0].label).to.equal('Package Manager');
    expect(getScripts(provider, nestedGroup).map((item) => item.label)).to.deep.equal(['lint']);
    provider.dispose();
  });

  it('includes package manager section with four settings rows', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }],
    });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(30);
    const [group] = getPackageGroups(provider);
    const [pmGroup] = provider.getChildren(group) as TreeNode[];
    expect(pmGroup.label).to.equal('Package Manager');
    expect(pmGroup.collapsibleState).to.equal(vscodeMock.TreeItemCollapsibleState.Collapsed);

    const pmChildren = provider.getChildren(pmGroup) as TreeNode[];
    expect(pmChildren.map((item) => item.label)).to.deep.equal([
      'Manager',
      'Registry',
      'Install Dependencies',
      'View Installed Packages',
    ]);
    provider.dispose();
  });

  it('filters packages by path and keeps all scripts in matched packages', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }, { fsPath: nestedPackageJson }],
    });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(30);
    provider.setFilter('nested');

    const search = (provider.getChildren() as TreeNode[])[0];
    expect(search.label).to.equal('nested');
    expect(search.description).to.equal('Click to edit');

    const groups = getPackageGroups(provider);
    expect(groups).to.have.length(1);
    expect(normalizeLabel(groups[0].label)).to.equal('workspace/nested/pkg');
    expect(groups[0].collapsibleState).to.equal(vscodeMock.TreeItemCollapsibleState.Expanded);

    const children = provider.getChildren(groups[0]) as TreeNode[];
    expect(children[0].label).to.equal('Package Manager');
    expect(getScripts(provider, groups[0]).map((item) => item.label)).to.deep.equal(['lint']);

    provider.setFilter('does-not-match');
    expect(getPackageGroups(provider)).to.be.empty;

    provider.setFilter('');
    const restored = getPackageGroups(provider);
    expect(restored).to.have.length(2);
    const nested = restored.find(
      (item) => normalizeLabel(item.label) === 'workspace/nested/pkg',
    );
    expect(nested?.collapsibleState).to.equal(vscodeMock.TreeItemCollapsibleState.Collapsed);
    provider.dispose();
  });

  it('persists the filter query and restores it on restart', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }, { fsPath: nestedPackageJson }],
    });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const workspaceState = createWorkspaceState();
    const provider = new NpmScriptsProvider(workspaceState);

    await wait(30);
    provider.setFilter('  nested  ');
    await wait(0);

    expect(workspaceState.store['jsRunner.npmScriptsFilter']).to.equal('nested');
    expect(
      vscodeMock.commands.executeCommand.calledWith('setContext', 'jsRunner.npmScriptsFiltered', true),
    ).to.be.true;
    provider.dispose();

    const restartedMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }, { fsPath: nestedPackageJson }],
    });
    const { NpmScriptsProvider: RestartedProvider } = loadNpmScriptsProviderModule(
      restartedMock,
      fs,
    );
    const restarted = new RestartedProvider(workspaceState);
    await wait(30);

    const search = (restarted.getChildren() as TreeNode[])[0];
    expect(search.label).to.equal('nested');
    const groups = getPackageGroups(restarted);
    expect(groups).to.have.length(1);
    expect(normalizeLabel(groups[0].label)).to.equal('workspace/nested/pkg');
    expect(
      restartedMock.commands.executeCommand.calledWith(
        'setContext',
        'jsRunner.npmScriptsFiltered',
        true,
      ),
    ).to.be.true;
    restarted.dispose();
  });

  it('persists an empty filter after clearing search', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }, { fsPath: nestedPackageJson }],
    });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const workspaceState = createWorkspaceState({
      'jsRunner.npmScriptsFilter': 'nested',
    });
    const provider = new NpmScriptsProvider(workspaceState);

    await wait(30);
    provider.setFilter('');
    await wait(0);

    expect(workspaceState.store['jsRunner.npmScriptsFilter']).to.equal('');
    expect(
      vscodeMock.commands.executeCommand.calledWith(
        'setContext',
        'jsRunner.npmScriptsFiltered',
        false,
      ),
    ).to.be.true;
    provider.dispose();
  });

  it('pins scripts to the top and restores name order on unpin', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }],
    });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(30);
    const [group] = getPackageGroups(provider);
    expect(getScripts(provider, group).map((item) => item.label)).to.deep.equal([
      'build',
      'start',
      'test',
    ]);

    const testScript = getScripts(provider, group).find((item) => item.label === 'test')?.script;
    expect(testScript).to.exist;
    await provider.pinNpmScript(testScript!);

    const pinned = getScripts(provider, group);
    expect(pinned.map((item) => item.label)).to.deep.equal(['test', 'build', 'start']);
    expect(pinned[0].contextValue).to.equal('npmScriptPinned');

    await provider.unpinNpmScript(testScript!);
    expect(getScripts(provider, group).map((item) => item.label)).to.deep.equal([
      'build',
      'start',
      'test',
    ]);
    provider.dispose();
  });

  it('pins packages to the top and restores label order on unpin', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }, { fsPath: nestedPackageJson }],
    });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(30);
    expect(getPackageGroups(provider).map((item) => normalizeLabel(item.label))).to.deep.equal([
      'workspace',
      'workspace/nested/pkg',
    ]);

    await provider.pinNpmPackage(nestedPackageJson);
    const pinned = getPackageGroups(provider);
    expect(pinned.map((item) => normalizeLabel(item.label))).to.deep.equal([
      'workspace/nested/pkg',
      'workspace',
    ]);
    expect(pinned[0].contextValue).to.equal('packageGroupPinned');
    expect(pinned[1].contextValue).to.equal('packageGroup');

    await provider.unpinNpmPackage(nestedPackageJson);
    expect(getPackageGroups(provider).map((item) => normalizeLabel(item.label))).to.deep.equal([
      'workspace',
      'workspace/nested/pkg',
    ]);
    provider.dispose();
  });

  it('refresh triggers rescan', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }],
    });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(30);
    provider.refresh();
    await wait(30);

    expect(vscodeMock.workspace.findFiles.callCount).to.be.greaterThan(1);
    provider.dispose();
  });

  it('refreshes only expanded package groups after a rescan', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }, { fsPath: nestedPackageJson }],
    });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(30);
    const groups = getPackageGroups(provider);
    const events: unknown[] = [];
    provider.onDidChangeTreeData((element) => {
      events.push(element);
    });

    provider.refresh();
    await wait(30);

    expect(events).to.deep.equal([groups[0]]);
    provider.dispose();
  });

  it('ignores package.json changes inside node_modules', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }],
    });
    const { NpmScriptsProvider, SCAN_DEBOUNCE_MS, isInsideNodeModules } =
      loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(30);
    expect(isInsideNodeModules(path.join(fixtureRoot, 'node_modules', 'next', 'package.json'))).to
      .be.true;
    expect(isInsideNodeModules(rootPackageJson)).to.be.false;

    const initialFindCount = vscodeMock.workspace.findFiles.callCount;
    const packageJsonWatcher = vscodeMock.workspace.createFileSystemWatcher.getCall(0)
      .returnValue as {
      onDidChange: { firstCall: { args: Array<(uri: { fsPath: string }) => void> } };
    };
    const handler = packageJsonWatcher.onDidChange.firstCall.args[0];
    handler({ fsPath: path.join(fixtureRoot, 'node_modules', 'next', 'package.json') });
    await wait(SCAN_DEBOUNCE_MS + 50);

    expect(vscodeMock.workspace.findFiles.callCount).to.equal(initialFindCount);
    provider.dispose();
  });

  it('debounces burst watcher events into a single rescan', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }],
    });
    const { NpmScriptsProvider, SCAN_DEBOUNCE_MS } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(20);
    const initialFindCount = vscodeMock.workspace.findFiles.callCount;
    const packageJsonWatcher = vscodeMock.workspace.createFileSystemWatcher.getCall(0)
      .returnValue as {
      onDidChange: { firstCall: { args: Array<(uri: { fsPath: string }) => void> } };
    };
    const handler = packageJsonWatcher.onDidChange.firstCall.args[0];
    handler({ fsPath: rootPackageJson });
    handler({ fsPath: rootPackageJson });
    handler({ fsPath: rootPackageJson });
    await wait(SCAN_DEBOUNCE_MS + 50);

    expect(vscodeMock.workspace.findFiles.callCount).to.equal(initialFindCount + 1);
    provider.dispose();
  });

  it('does not watch node_modules directories', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }],
    });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(20);
    const patterns = vscodeMock.workspace.createFileSystemWatcher
      .getCalls()
      .map((call) => String(call.args[0]));
    expect(patterns.some((pattern) => pattern.includes('node_modules'))).to.be.false;
    provider.dispose();
  });
});
