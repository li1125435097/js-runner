import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as proxyquire from 'proxyquire';
import { loadPackageManagerModule } from '../helpers/loadModules';
import { createVscodeMock } from '../helpers/vscodeMock';

function loadPackageManagerModuleWithConfig(
  vscodeMock: ReturnType<typeof createVscodeMock>,
  configuration: Record<string, unknown> = {},
) {
  return loadPackageManagerModule(vscodeMock, configuration) as {
    detectPackageManager: (packageJsonPath: string) => string;
    resolvePackageManager: (packageJsonPath: string) => string;
    clearPackageManagerCacheForTest: () => void;
  };
}

describe('packageManager', () => {
  let tempDir: string;
  let packageJsonPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-runner-pm-'));
    packageJsonPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify({ name: 'demo', scripts: { build: 'echo build' } }));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects pnpm from packageManager field', () => {
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({ packageManager: 'pnpm@9.0.0', scripts: { build: 'echo build' } }),
    );
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
    });
    const { detectPackageManager } = loadPackageManagerModuleWithConfig(vscodeMock);

    expect(detectPackageManager(packageJsonPath)).to.equal('pnpm');
  });

  it('detects yarn from lockfile in workspace root', () => {
    fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n');
    const nestedDir = path.join(tempDir, 'packages', 'app');
    fs.mkdirSync(nestedDir, { recursive: true });
    const nestedPackageJson = path.join(nestedDir, 'package.json');
    fs.writeFileSync(
      nestedPackageJson,
      JSON.stringify({ scripts: { dev: 'vite' } }),
    );

    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
    });
    const { detectPackageManager } = loadPackageManagerModuleWithConfig(vscodeMock);

    expect(detectPackageManager(nestedPackageJson)).to.equal('yarn');
  });

  it('defaults to npm when nothing is configured', () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
    });
    const { detectPackageManager } = loadPackageManagerModuleWithConfig(vscodeMock);

    expect(detectPackageManager(packageJsonPath)).to.equal('npm');
  });

  it('uses workspace packageManagerSettings override', () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
      configuration: {
        'jsRunner.packageManagerSettings': {
          '': { manager: 'bun', registry: 'auto' },
        },
      },
    });
    const { resolvePackageManager } = loadPackageManagerModuleWithConfig(vscodeMock);

    expect(resolvePackageManager(packageJsonPath)).to.equal('bun');
  });

  it('uses global packageManager override when manager is auto', () => {
    const vscodeMock = createVscodeMock({
      workspaceFolders: [{ uri: { fsPath: tempDir }, name: 'demo' }],
      configuration: {
        'jsRunner.packageManager': 'pnpm',
      },
    });
    const { resolvePackageManager } = loadPackageManagerModuleWithConfig(vscodeMock);

    expect(resolvePackageManager(packageJsonPath)).to.equal('pnpm');
  });
});

describe('packageManagerCommands', () => {
  it('builds run and install commands', () => {
    const commands = proxyquire.noCallThru()('../../packageManagerCommands', {}) as {
      buildRunScriptCommand: (pm: string, scriptName: string) => string;
      buildInstallCommand: (pm: string) => string;
    };

    expect(commands.buildRunScriptCommand('pnpm', 'build')).to.equal('pnpm run build');
    expect(commands.buildRunScriptCommand('npm', 'my script')).to.equal('npm run "my script"');
    expect(commands.buildInstallCommand('yarn')).to.equal('yarn install');
  });
});
