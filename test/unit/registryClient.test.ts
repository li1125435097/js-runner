import { expect } from 'chai';
import * as proxyquire from 'proxyquire';

function loadRegistryClient() {
  return proxyquire.noCallThru()('../../packageManager/registryClient', {}) as {
    buildRegistryPackageMetadataUrl: (registryUrl: string, packageName: string) => string;
    parseRegistryPackageMetadata: (payload: unknown) => {
      versions: string[];
      distTags: Record<string, string>;
    };
    fetchRegistryPackageVersions: (
      registryUrl: string,
      packageName: string,
    ) => Promise<{ versions: string[]; distTags: Record<string, string> }>;
    setRegistryHttpGetForTest: (getter: ((url: string) => Promise<string>) | undefined) => void;
  };
}

describe('registryClient', () => {
  const client = loadRegistryClient();

  afterEach(() => {
    client.setRegistryHttpGetForTest(undefined);
  });

  it('encodes scoped package names in registry metadata URLs', () => {
    expect(
      client.buildRegistryPackageMetadataUrl('https://registry.npmjs.org/', '@types/node'),
    ).to.equal('https://registry.npmjs.org/%40types%2Fnode');
    expect(
      client.buildRegistryPackageMetadataUrl('https://registry.npmmirror.com/', 'lodash'),
    ).to.equal('https://registry.npmmirror.com/lodash');
  });

  it('parses registry metadata and sorts versions newest first', () => {
    const parsed = client.parseRegistryPackageMetadata({
      versions: {
        '1.0.0': {},
        '2.0.0': {},
        '2.0.0-rc.1': {},
      },
      'dist-tags': { latest: '2.0.0', next: '2.0.0-rc.1' },
    });

    expect(parsed.distTags).to.deep.equal({ latest: '2.0.0', next: '2.0.0-rc.1' });
    expect(parsed.versions).to.deep.equal(['2.0.0', '2.0.0-rc.1', '1.0.0']);
  });

  it('fetches and parses registry package versions', async () => {
    client.setRegistryHttpGetForTest(async (url) => {
      expect(url).to.equal('https://registry.npmjs.org/lodash');
      return JSON.stringify({
        versions: { '4.17.20': {}, '4.17.21': {} },
        'dist-tags': { latest: '4.17.21' },
      });
    });

    const result = await client.fetchRegistryPackageVersions('https://registry.npmjs.org/', 'lodash');
    expect(result.distTags.latest).to.equal('4.17.21');
    expect(result.versions).to.deep.equal(['4.17.21', '4.17.20']);
  });
});
