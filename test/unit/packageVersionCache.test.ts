import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as proxyquire from 'proxyquire';

function writePackage(dir: string, pkg: { name: string; version: string }): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
}

function loadCacheModule() {
  return proxyquire.noCallThru()('../../packageManager/packageVersionCache', {}) as {
    canSwitchInstalledPackage: (packageDir: string, name: string) => boolean;
    listCachedVersions: (packageDir: string, name: string) => string[];
    seedCurrentInstalledVersion: (packageDir: string, name: string) => string | undefined;
    switchInstalledVersion: (packageDir: string, name: string, version: string) => void;
    getCachedPackageEntry: (packageDir: string, name: string, version: string) => string;
    getTopLevelPackagePath: (packageDir: string, name: string) => string;
    buildNpmCacheInstallArgs: (
      name: string,
      version: string,
      cachePrefixDir: string,
      registryUrl: string,
    ) => string[];
    getNpmCliName: () => string;
    installPackageVersionToCache: (
      packageDir: string,
      name: string,
      version: string,
      registryUrl: string,
    ) => Promise<void>;
    setNpmInstallRunnerForTest: (
      runner:
        | ((command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>)
        | undefined,
    ) => void;
    compareVersionsDescending: (a: string, b: string) => number;
  };
}

describe('packageVersionCache', () => {
  let tempDir: string;
  let cache: ReturnType<typeof loadCacheModule>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-runner-version-cache-'));
    cache = loadCacheModule();
    writePackage(path.join(tempDir, 'node_modules', 'lodash'), { name: 'lodash', version: '4.17.21' });
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'lodash', 'index.js'), 'module.exports = 1;\n');
  });

  afterEach(() => {
    cache.setNpmInstallRunnerForTest(undefined);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('seeds the current installed version into the local cache', () => {
    expect(cache.seedCurrentInstalledVersion(tempDir, 'lodash')).to.equal('4.17.21');
    expect(cache.listCachedVersions(tempDir, 'lodash')).to.deep.equal(['4.17.21']);

    const cachedJson = path.join(
      cache.getCachedPackageEntry(tempDir, 'lodash', '4.17.21'),
      'package.json',
    );
    expect(JSON.parse(fs.readFileSync(cachedJson, 'utf-8'))).to.deep.include({ version: '4.17.21' });
    expect(fs.existsSync(path.join(tempDir, '.js-runner', '.gitignore'))).to.be.true;
  });

  it('lists cached versions newest first', () => {
    writePackage(cache.getCachedPackageEntry(tempDir, 'lodash', '4.17.20'), {
      name: 'lodash',
      version: '4.17.20',
    });
    writePackage(cache.getCachedPackageEntry(tempDir, 'lodash', '4.17.21'), {
      name: 'lodash',
      version: '4.17.21',
    });
    writePackage(cache.getCachedPackageEntry(tempDir, 'lodash', '5.0.0-rc.1'), {
      name: 'lodash',
      version: '5.0.0-rc.1',
    });

    expect(cache.listCachedVersions(tempDir, 'lodash')).to.deep.equal([
      '5.0.0-rc.1',
      '4.17.21',
      '4.17.20',
    ]);
  });

  it('switches versions by replacing only the top-level symlink', () => {
    const storeDir = path.join(tempDir, 'store', 'lodash');
    writePackage(storeDir, { name: 'lodash', version: '1.0.0' });
    fs.writeFileSync(path.join(storeDir, 'marker.txt'), 'from-store');

    const topLevel = cache.getTopLevelPackagePath(tempDir, 'lodash');
    fs.rmSync(topLevel, { recursive: true, force: true });
    fs.symlinkSync(storeDir, topLevel, process.platform === 'win32' ? 'junction' : 'dir');

    writePackage(cache.getCachedPackageEntry(tempDir, 'lodash', '2.0.0'), {
      name: 'lodash',
      version: '2.0.0',
    });
    fs.writeFileSync(
      path.join(cache.getCachedPackageEntry(tempDir, 'lodash', '2.0.0'), 'marker.txt'),
      'from-cache',
    );

    cache.switchInstalledVersion(tempDir, 'lodash', '2.0.0');

    expect(fs.existsSync(path.join(storeDir, 'marker.txt'))).to.be.true;
    expect(fs.readFileSync(path.join(storeDir, 'marker.txt'), 'utf-8')).to.equal('from-store');
    expect(JSON.parse(fs.readFileSync(path.join(topLevel, 'package.json'), 'utf-8')).version).to.equal(
      '2.0.0',
    );
    expect(fs.readFileSync(path.join(topLevel, 'marker.txt'), 'utf-8')).to.equal('from-cache');
    expect(cache.listCachedVersions(tempDir, 'lodash')).to.include('1.0.0');
  });

  it('disables switching for Yarn PnP without a node_modules entry', () => {
    const pnpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-runner-pnp-'));
    try {
      fs.writeFileSync(path.join(pnpDir, '.pnp.cjs'), '// yarn pnp\n');
      expect(cache.canSwitchInstalledPackage(pnpDir, 'lodash')).to.be.false;

      fs.mkdirSync(path.join(pnpDir, 'node_modules'));
      expect(cache.canSwitchInstalledPackage(pnpDir, 'lodash')).to.be.false;

      writePackage(path.join(pnpDir, 'node_modules', 'lodash'), { name: 'lodash', version: '4.17.21' });
      expect(cache.canSwitchInstalledPackage(pnpDir, 'lodash')).to.be.true;
    } finally {
      fs.rmSync(pnpDir, { recursive: true, force: true });
    }
  });

  it('disables switching when node_modules is missing', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-runner-empty-'));
    try {
      expect(cache.canSwitchInstalledPackage(emptyDir, 'lodash')).to.be.false;
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('builds npm cache install args without saving to the project', () => {
    const args = cache.buildNpmCacheInstallArgs(
      'lodash',
      '4.17.20',
      path.join(tempDir, '.js-runner', 'packages', 'lodash', '4.17.20'),
      'https://registry.npmjs.org/',
    );

    expect(args).to.deep.equal([
      'install',
      'lodash@4.17.20',
      '--prefix',
      path.join(tempDir, '.js-runner', 'packages', 'lodash', '4.17.20'),
      '--no-package-lock',
      '--ignore-scripts',
      '--registry',
      'https://registry.npmjs.org/',
    ]);
    expect(cache.getNpmCliName()).to.equal(process.platform === 'win32' ? 'npm.cmd' : 'npm');
  });

  it('installs a version into the cache using the npm runner', async () => {
    cache.setNpmInstallRunnerForTest(async (_command, args) => {
      const prefixIndex = args.indexOf('--prefix');
      const prefix = args[prefixIndex + 1];
      writePackage(path.join(prefix, 'node_modules', 'lodash'), { name: 'lodash', version: '4.17.20' });
      return { stdout: '', stderr: '' };
    });

    await cache.installPackageVersionToCache(
      tempDir,
      'lodash',
      '4.17.20',
      'https://registry.npmjs.org/',
    );

    expect(cache.listCachedVersions(tempDir, 'lodash')).to.include('4.17.20');
  });

  it('supports scoped package cache paths', () => {
    writePackage(path.join(tempDir, 'node_modules', '@types', 'node'), {
      name: '@types/node',
      version: '18.0.0',
    });
    expect(cache.seedCurrentInstalledVersion(tempDir, '@types/node')).to.equal('18.0.0');
    expect(cache.listCachedVersions(tempDir, '@types/node')).to.deep.equal(['18.0.0']);
  });
});
