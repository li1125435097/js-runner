import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import { loadPackageManagerModule } from '../helpers/loadModules';
import { createVscodeMock } from '../helpers/vscodeMock';

function writeCachedPackage(packageDir: string, name: string, version: string): void {
  const entry = path.join(packageDir, '.js-runner', 'packages', name, version, 'node_modules', name);
  fs.mkdirSync(entry, { recursive: true });
  fs.writeFileSync(path.join(entry, 'package.json'), JSON.stringify({ name, version }));
}

function loadPanelModule(
  vscodeMock: ReturnType<typeof createVscodeMock>,
  extraStubs: Record<string, unknown> = {},
) {
  const packageManager = loadPackageManagerModule(vscodeMock);
  const packageVersionCache =
    extraStubs['./packageVersionCache'] ??
    proxyquire.noCallThru()('../../packageManager/packageVersionCache', {});
  const registryClient =
    extraStubs['./registryClient'] ??
    proxyquire.noCallThru()('../../packageManager/registryClient', {});

  return proxyquire.noCallThru()('../../packageManager/installedPackagesPanel', {
    vscode: vscodeMock,
    './packageManager': packageManager,
    './packageManagerConfig': proxyquire.noCallThru()('../../packageManager/packageManagerConfig', {
      vscode: vscodeMock,
    }),
    './registryConfig': proxyquire.noCallThru()('../../packageManager/registryConfig', {}),
    '../common/registryPresets': proxyquire.noCallThru()('../../common/registryPresets', {}),
    './packageVersionCache': packageVersionCache,
    './registryClient': registryClient,
    ...extraStubs,
  }) as {
    buildInstalledPackagesSummary: (path: string) => {
      packageName: string;
      rows: Array<{
        name: string;
        type: string;
        declared: string;
        installed: string;
        cachedVersions: string[];
        canSwitch: boolean;
      }>;
    };
    filterInstalledPackageRows: (
      rows: Array<{ name: string; type: 'prod' | 'dev' | 'peer' | 'optional' }>,
      filter: 'all' | 'prod' | 'dev' | 'peer' | 'optional',
    ) => Array<{ name: string; type: string }>;
    viewInstalledPackages: (
      path: string,
      context: { subscriptions: unknown[] },
    ) => void;
  };
}

describe('installedPackagesPanel', () => {
  let tempDir: string;
  let packageJsonPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-runner-packages-'));
    packageJsonPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({
        name: 'demo-app',
        dependencies: { lodash: '^4.17.0' },
        devDependencies: { typescript: '^5.0.0' },
      }),
    );
    fs.mkdirSync(path.join(tempDir, 'node_modules', 'lodash'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'node_modules', 'lodash', 'package.json'),
      JSON.stringify({ version: '4.17.21' }),
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds installed package summary from package.json and node_modules', () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
    });
    const panel = loadPanelModule(vscodeMock);

    const summary = panel.buildInstalledPackagesSummary(packageJsonPath);

    expect(summary.packageName).to.equal('demo-app');
    expect(summary.rows).to.have.length(2);
    expect(summary.rows.find((row) => row.name === 'lodash')).to.deep.include({
      type: 'prod',
      declared: '^4.17.0',
      installed: '4.17.21',
      canSwitch: true,
    });
    expect(summary.rows.find((row) => row.name === 'lodash')?.cachedVersions).to.deep.equal(['4.17.21']);
    expect(summary.rows.find((row) => row.name === 'typescript')).to.deep.include({
      type: 'dev',
      declared: '^5.0.0',
      installed: '—',
      canSwitch: true,
    });
  });

  it('filters installed package rows by dependency type', () => {
    const vscodeMock = createVscodeMock();
    const panel = loadPanelModule(vscodeMock);

    const rows = [
      { name: 'lodash', type: 'prod' as const },
      { name: 'typescript', type: 'dev' as const },
    ];

    expect(panel.filterInstalledPackageRows(rows, 'dev')).to.deep.equal([
      { name: 'typescript', type: 'dev' },
    ]);
  });

  it('opens installed packages in the active editor column on click', () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
    });
    const panel = loadPanelModule(vscodeMock);

    panel.viewInstalledPackages(packageJsonPath, { subscriptions: [] });

    expect(vscodeMock.window.createWebviewPanel.calledOnce).to.be.true;
    expect(vscodeMock.window.createWebviewPanel.firstCall.args[2]).to.equal(
      vscodeMock.ViewColumn.Active,
    );
    expect(vscodeMock.window.createWebviewPanel.firstCall.args[2]).to.not.equal(
      vscodeMock.ViewColumn.Beside,
    );

    const created = vscodeMock.window.createWebviewPanel.firstCall.returnValue as {
      reveal: sinon.SinonStub;
    };
    panel.viewInstalledPackages(packageJsonPath, { subscriptions: [] });
    expect(vscodeMock.window.createWebviewPanel.calledOnce).to.be.true;
    expect(created.reveal.calledOnceWithExactly(vscodeMock.ViewColumn.Active)).to.be.true;
  });

  it('disables switching for Yarn PnP packages without a node_modules entry', () => {
    fs.writeFileSync(path.join(tempDir, '.pnp.cjs'), '// yarn pnp\n');
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
    });
    const panel = loadPanelModule(vscodeMock);
    const summary = panel.buildInstalledPackagesSummary(packageJsonPath);

    expect(summary.rows.find((row) => row.name === 'lodash')?.canSwitch).to.be.true;
    expect(summary.rows.find((row) => row.name === 'typescript')?.canSwitch).to.be.false;
  });

  it('switches a cached version from a webview message', async () => {
    writeCachedPackage(tempDir, 'lodash', '4.17.20');
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
    });
    const panel = loadPanelModule(vscodeMock);
    panel.viewInstalledPackages(packageJsonPath, { subscriptions: [] });

    const created = vscodeMock.window.createWebviewPanel.firstCall.returnValue as {
      webview: { onDidReceiveMessage: sinon.SinonStub };
    };
    const handler = created.webview.onDidReceiveMessage.firstCall.args[0] as (
      message: unknown,
    ) => Promise<void>;

    await handler({ type: 'switchVersion', name: 'lodash', version: '4.17.20' });

    expect(
      JSON.parse(fs.readFileSync(path.join(tempDir, 'node_modules', 'lodash', 'package.json'), 'utf-8'))
        .version,
    ).to.equal('4.17.20');
  });

  it('ignores switch requests for packages that are not in the summary', async () => {
    writeCachedPackage(tempDir, 'left-pad', '1.0.0');
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
    });
    const panel = loadPanelModule(vscodeMock);
    panel.viewInstalledPackages(packageJsonPath, { subscriptions: [] });

    const created = vscodeMock.window.createWebviewPanel.firstCall.returnValue as {
      webview: { onDidReceiveMessage: sinon.SinonStub };
    };
    const handler = created.webview.onDidReceiveMessage.firstCall.args[0] as (
      message: unknown,
    ) => Promise<void>;

    await handler({ type: 'switchVersion', name: 'left-pad', version: '1.0.0' });

    expect(
      JSON.parse(fs.readFileSync(path.join(tempDir, 'node_modules', 'lodash', 'package.json'), 'utf-8'))
        .version,
    ).to.equal('4.17.21');
    expect(fs.existsSync(path.join(tempDir, 'node_modules', 'left-pad'))).to.be.false;
  });

  it('caches a registry version chosen from QuickPick', async () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
    });
    const packageVersionCache = proxyquire.noCallThru()('../../packageManager/packageVersionCache', {});
    packageVersionCache.setNpmInstallRunnerForTest(async (_command: string, args: string[]) => {
      const prefix = args[args.indexOf('--prefix') + 1];
      const entry = path.join(prefix, 'node_modules', 'lodash');
      fs.mkdirSync(entry, { recursive: true });
      fs.writeFileSync(
        path.join(entry, 'package.json'),
        JSON.stringify({ name: 'lodash', version: '4.17.20' }),
      );
      return { stdout: '', stderr: '' };
    });
    vscodeMock.window.showQuickPick.resolves({ label: '4.17.20', version: '4.17.20' });

    const panel = loadPanelModule(vscodeMock, {
      './packageVersionCache': packageVersionCache,
      './registryClient': {
        fetchRegistryPackageVersions: async () => ({
          versions: ['4.17.20', '4.17.21'],
          distTags: { latest: '4.17.21' },
        }),
      },
    });
    panel.viewInstalledPackages(packageJsonPath, { subscriptions: [] });

    const created = vscodeMock.window.createWebviewPanel.firstCall.returnValue as {
      webview: { onDidReceiveMessage: sinon.SinonStub };
    };
    const handler = created.webview.onDidReceiveMessage.firstCall.args[0] as (
      message: unknown,
    ) => Promise<void>;

    await handler({ type: 'addVersion', name: 'lodash' });

    expect(vscodeMock.window.showQuickPick.calledOnce).to.be.true;
    expect(
      fs.existsSync(
        path.join(
          tempDir,
          '.js-runner',
          'packages',
          'lodash',
          '4.17.20',
          'node_modules',
          'lodash',
          'package.json',
        ),
      ),
    ).to.be.true;
  });
});
