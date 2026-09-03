import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as proxyquire from 'proxyquire';
import { loadPackageManagerModule } from '../helpers/loadModules';
import { createVscodeMock } from '../helpers/vscodeMock';

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
    const packageManager = proxyquire.noCallThru()('../../packageManager', {
      vscode: vscodeMock,
      './packageManagerConfig': proxyquire.noCallThru()('../../packageManagerConfig', {
        vscode: vscodeMock,
      }),
    });
    const panel = proxyquire.noCallThru()('../../installedPackagesPanel', {
      vscode: vscodeMock,
      './packageManager': packageManager,
      './packageManagerConfig': proxyquire.noCallThru()('../../packageManagerConfig', {
        vscode: vscodeMock,
      }),
      './registryConfig': proxyquire.noCallThru()('../../registryConfig', {}),
      './registryPresets': proxyquire.noCallThru()('../../registryPresets', {}),
    }) as {
      buildInstalledPackagesSummary: (path: string) => {
        packageName: string;
        rows: Array<{ name: string; type: string; declared: string; installed: string }>;
      };
    };

    const summary = panel.buildInstalledPackagesSummary(packageJsonPath);

    expect(summary.packageName).to.equal('demo-app');
    expect(summary.rows).to.have.length(2);
    expect(summary.rows.find((row) => row.name === 'lodash')).to.deep.include({
      type: 'prod',
      declared: '^4.17.0',
      installed: '4.17.21',
    });
    expect(summary.rows.find((row) => row.name === 'typescript')).to.deep.include({
      type: 'dev',
      declared: '^5.0.0',
      installed: '—',
    });
  });

  it('filters installed package rows by dependency type', () => {
    const vscodeMock = createVscodeMock();
    const packageManager = loadPackageManagerModule(vscodeMock);
    const panel = proxyquire.noCallThru()('../../installedPackagesPanel', {
      vscode: vscodeMock,
      './packageManager': packageManager,
      './packageManagerConfig': proxyquire.noCallThru()('../../packageManagerConfig', {
        vscode: vscodeMock,
      }),
      './registryConfig': proxyquire.noCallThru()('../../registryConfig', {}),
      './registryPresets': proxyquire.noCallThru()('../../registryPresets', {}),
    }) as {
      filterInstalledPackageRows: (
        rows: Array<{ name: string; type: 'prod' | 'dev' | 'peer' | 'optional' }>,
        filter: 'all' | 'prod' | 'dev' | 'peer' | 'optional',
      ) => Array<{ name: string; type: string }>;
    };

    const rows = [
      { name: 'lodash', type: 'prod' as const },
      { name: 'typescript', type: 'dev' as const },
    ];

    expect(panel.filterInstalledPackageRows(rows, 'dev')).to.deep.equal([
      { name: 'typescript', type: 'dev' },
    ]);
  });
});
