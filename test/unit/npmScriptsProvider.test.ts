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

function normalizeLabel(label: string | undefined): string {
  return (label ?? '').replace(/\\/g, '/');
}

describe('NpmScriptsProvider', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('returns empty tree when workspace has no folders', async () => {
    const vscodeMock = createVscodeMock({ workspaceFolders: [] });
    const { NpmScriptsProvider } = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(20);
    expect(provider.getChildren()).to.be.empty;
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
    const groups = provider.getChildren() as Array<{
      label?: string;
      collapsibleState?: number;
    }>;
    expect(groups).to.have.length(2);

    const rootGroup = groups.find((item) => item.label === 'workspace');
    expect(rootGroup).to.exist;
    expect(rootGroup?.collapsibleState).to.equal(vscodeMock.TreeItemCollapsibleState.Expanded);
    expect((rootGroup as { id?: string }).id).to.equal(`package-group:${rootPackageJson}`);
    const rootChildren = provider.getChildren(rootGroup) as Array<{ label?: string }>;
    expect(rootChildren[0].label).to.equal('Package Manager');
    const rootScripts = rootChildren.filter((item) => item.label !== 'Package Manager');
    expect(rootScripts.map((item) => item.label)).to.include.members([
      'build',
      'start',
      'test',
    ]);

    const nestedGroup = groups.find(
      (item) => normalizeLabel(item.label) === 'workspace/nested/pkg',
    );
    expect(nestedGroup).to.exist;
    expect(nestedGroup?.collapsibleState).to.equal(vscodeMock.TreeItemCollapsibleState.Collapsed);
    expect((nestedGroup as { id?: string }).id).to.equal(`package-group:${nestedPackageJson}`);
    const nestedChildren = provider.getChildren(nestedGroup) as Array<{ label?: string }>;
    expect(nestedChildren[0].label).to.equal('Package Manager');
    const nestedScripts = nestedChildren.filter((item) => item.label !== 'Package Manager');
    expect(nestedScripts.map((item) => item.label)).to.deep.equal(['lint']);
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
    const [group] = provider.getChildren() as Array<{ label?: string; collapsibleState?: number }>;
    const [pmGroup] = provider.getChildren(group) as Array<{
      label?: string;
      collapsibleState?: number;
    }>;
    expect(pmGroup.label).to.equal('Package Manager');
    expect(pmGroup.collapsibleState).to.equal(vscodeMock.TreeItemCollapsibleState.Expanded);

    const pmChildren = provider.getChildren(pmGroup) as Array<{ label?: string }>;
    expect(pmChildren.map((item) => item.label)).to.deep.equal([
      'Manager',
      'Registry',
      'Install Dependencies',
      'View Installed Packages',
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
    const groups = provider.getChildren();
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

    await wait(30);
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
