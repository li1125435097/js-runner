import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as proxyquire from 'proxyquire';

describe('registryConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-runner-registry-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes and reads registry from .npmrc', () => {
    const registryConfig = proxyquire.noCallThru()('../../packageManager/registryConfig', {}) as {
      writeRegistryToNpmrc: (dir: string, url: string) => void;
      readRegistryFromNpmrc: (dir: string) => string | undefined;
    };

    registryConfig.writeRegistryToNpmrc(tempDir, 'https://registry.npmmirror.com');
    expect(registryConfig.readRegistryFromNpmrc(tempDir)).to.equal(
      'https://registry.npmmirror.com',
    );
  });

  it('updates existing registry line in .npmrc', () => {
    const registryConfig = proxyquire.noCallThru()('../../packageManager/registryConfig', {}) as {
      writeRegistryToNpmrc: (dir: string, url: string) => void;
      readRegistryFromNpmrc: (dir: string) => string | undefined;
    };

    fs.writeFileSync(path.join(tempDir, '.npmrc'), 'registry=https://registry.npmjs.org/\n');
    registryConfig.writeRegistryToNpmrc(tempDir, 'https://registry.npmmirror.com');

    expect(registryConfig.readRegistryFromNpmrc(tempDir)).to.equal(
      'https://registry.npmmirror.com',
    );
  });

  it('resolves preset registry ids', () => {
    const registryConfig = proxyquire.noCallThru()('../../packageManager/registryConfig', {}) as {
      resolveRegistryUrl: (packageJsonPath: string, setting: string) => string;
    };
    const packageJsonPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(packageJsonPath, '{}');

    expect(registryConfig.resolveRegistryUrl(packageJsonPath, 'npmmirror')).to.equal(
      'https://registry.npmmirror.com',
    );
  });
});

describe('registryPresets', () => {
  it('finds preset by url', () => {
    const presets = proxyquire.noCallThru()('../../common/registryPresets', {}) as {
      findRegistryPresetByUrl: (url: string) => { id: string } | undefined;
    };

    expect(presets.findRegistryPresetByUrl('https://registry.npmmirror.com/')?.id).to.equal(
      'npmmirror',
    );
  });
});
