import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as proxyquire from 'proxyquire';
import { createVscodeMock } from '../helpers/vscodeMock';

describe('packageManagerConfig', () => {
  let tempDir: string;
  let packageJsonPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-runner-pmc-'));
    packageJsonPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify({ name: 'demo', scripts: { build: 'echo build' } }));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function loadConfigModule(vscodeMock: ReturnType<typeof createVscodeMock>) {
    return proxyquire.noCallThru()('../../packageManager/packageManagerConfig', {
      vscode: vscodeMock,
    }) as {
      ROOT_PACKAGE_KEY: string;
      getRelativePackageKey: (path: string) => string;
      getPackageManagerSettings: (path: string) => { manager: string; registry: string };
      savePackageManagerSettings: (
        path: string,
        patch: { manager?: string; registry?: string },
      ) => Promise<void>;
    };
  }

  it('uses "." as the key for workspace root packages', () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
    });
    const config = loadConfigModule(vscodeMock);

    expect(config.getRelativePackageKey(packageJsonPath)).to.equal('.');
  });

  it('writes packageManagerSettings to workspace configuration', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
    });
    const config = loadConfigModule(vscodeMock);

    await config.savePackageManagerSettings(packageJsonPath, { manager: 'pnpm' });

    const configApi = vscodeMock.workspace.getConfiguration('jsRunner');
    expect(configApi.update.calledOnce).to.be.true;
    expect(configApi.update.firstCall.args[0]).to.equal('packageManagerSettings');
    expect(configApi.update.firstCall.args[1]).to.deep.equal({
      '.': { manager: 'pnpm', registry: 'auto' },
    });
    expect(configApi.update.firstCall.args[2]).to.equal(vscodeMock.ConfigurationTarget.Workspace);
    expect(config.getPackageManagerSettings(packageJsonPath).manager).to.equal('pnpm');
  });
});
