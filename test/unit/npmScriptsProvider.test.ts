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
    const NpmScriptsProvider = loadNpmScriptsProviderModule(vscodeMock, fs);
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
    const NpmScriptsProvider = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(30);
    const groups = provider.getChildren();
    expect(groups).to.have.length(2);

    const rootGroup = groups.find((item: { label?: string }) => item.label === 'workspace');
    expect(rootGroup).to.exist;
    const rootChildren = provider.getChildren(rootGroup);
    expect(rootChildren[0].label).to.equal('Package Manager');
    const rootScripts = rootChildren.filter(
      (item: { label?: string }) => item.label !== 'Package Manager',
    );
    expect(rootScripts.map((item: { label?: string }) => item.label)).to.include.members([
      'build',
      'start',
      'test',
    ]);

    const nestedGroup = groups.find(
      (item: { label?: string }) => normalizeLabel(item.label) === 'workspace/nested/pkg',
    );
    expect(nestedGroup).to.exist;
    const nestedChildren = provider.getChildren(nestedGroup);
    expect(nestedChildren[0].label).to.equal('Package Manager');
    const nestedScripts = nestedChildren.filter(
      (item: { label?: string }) => item.label !== 'Package Manager',
    );
    expect(nestedScripts.map((item: { label?: string }) => item.label)).to.deep.equal(['lint']);
    provider.dispose();
  });

  it('includes package manager section with four settings rows', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'workspace' }],
      workspaceFiles: [{ fsPath: rootPackageJson }],
    });
    const NpmScriptsProvider = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(30);
    const [group] = provider.getChildren();
    const [pmGroup] = provider.getChildren(group);
    expect(pmGroup.label).to.equal('Package Manager');

    const pmChildren = provider.getChildren(pmGroup);
    expect(pmChildren.map((item: { label?: string }) => item.label)).to.deep.equal([
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
    const NpmScriptsProvider = loadNpmScriptsProviderModule(vscodeMock, fs);
    const provider = new NpmScriptsProvider();

    await wait(30);
    provider.refresh();
    await wait(30);

    expect(vscodeMock.workspace.findFiles.callCount).to.be.greaterThan(1);
    provider.dispose();
  });
});
