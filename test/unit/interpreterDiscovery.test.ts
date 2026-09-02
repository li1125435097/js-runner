import { expect } from 'chai';
import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import { DEFAULT_INTERPRETERS } from '../helpers/constants';

type LanguageInterpreter = {
  languageId: string;
  label?: string;
  path: string;
};

type DiscoveryModule = {
  appendAvailableLocalInterpreters: (
    existing: LanguageInterpreter[],
    defaults: LanguageInterpreter[],
  ) => LanguageInterpreter[];
  setFindExecutableOverrideForTest: (
    override: ((executable: string) => string | undefined) | undefined,
  ) => void;
};

function loadDiscoveryModule(): DiscoveryModule {
  return proxyquire.noCallThru()('../../interpreterDiscovery', {}) as DiscoveryModule;
}

describe('interpreterDiscovery', () => {
  afterEach(() => {
    sinon.restore();
    loadDiscoveryModule().setFindExecutableOverrideForTest(undefined);
  });

  it('appends only defaults whose executables exist locally', () => {
    const discovery = loadDiscoveryModule();
    discovery.setFindExecutableOverrideForTest((executable: string) => {
      if (executable === 'node' || executable === 'python') {
        return `/usr/bin/${executable}`;
      }
      return undefined;
    });

    const result = discovery.appendAvailableLocalInterpreters([], DEFAULT_INTERPRETERS);

    expect(result.map((item: LanguageInterpreter) => item.languageId)).to.deep.equal([
      'javascript',
      'javascriptreact',
      'python',
      'typescript',
      'html',
    ]);
    expect(result.find((item: LanguageInterpreter) => item.languageId === 'typescript')?.path).to.equal(
      '/usr/bin/node --experimental-strip-types',
    );
  });

  it('keeps existing interpreters and only appends missing available defaults', () => {
    const discovery = loadDiscoveryModule();
    discovery.setFindExecutableOverrideForTest((executable: string) => `/usr/bin/${executable}`);

    const existing = [{ languageId: 'go', label: 'Go', path: 'go' }];
    const result = discovery.appendAvailableLocalInterpreters(existing, DEFAULT_INTERPRETERS);

    expect(result[0]).to.deep.equal(existing[0]);
    expect(result.some((item: LanguageInterpreter) => item.languageId === 'javascript')).to.be.true;
    expect(result.some((item: LanguageInterpreter) => item.languageId === 'go')).to.be.true;
    expect(result.filter((item: LanguageInterpreter) => item.languageId === 'go')).to.have.length(1);
  });

  it('prefers Git Bash over WSL System32 bash', () => {
    const { pickPreferredExecutable } = proxyquire.noCallThru()('../../interpreterDiscovery', {}) as {
      pickPreferredExecutable: (executable: string, candidates: string[]) => string | undefined;
    };

    expect(
      pickPreferredExecutable('bash', [
        'C:\\Windows\\System32\\bash.exe',
        'C:\\Program Files\\Git\\bin\\bash.exe',
      ]),
    ).to.equal('C:\\Program Files\\Git\\bin\\bash.exe');
  });

  it('always includes html without checking PATH', () => {
    const discovery = loadDiscoveryModule();
    discovery.setFindExecutableOverrideForTest(() => undefined);

    const result = discovery.appendAvailableLocalInterpreters([], DEFAULT_INTERPRETERS);

    expect(result).to.deep.equal([
      {
        languageId: 'html',
        label: 'HTML',
        path: 'default browser',
      },
    ]);
  });
});
