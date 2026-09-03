import { expect } from 'chai';
import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import { DEFAULT_INTERPRETERS } from '../helpers/constants';
import { createVscodeMock } from '../helpers/vscodeMock';

type LanguageInterpreter = {
  languageId: string;
  label?: string;
  path: string;
};

function loadInterpreterConfigModule(vscodeMock: ReturnType<typeof createVscodeMock>) {
  const discovery = proxyquire.noCallThru()('../../interpreter/interpreterDiscovery', {}) as {
    setFindExecutableOverrideForTest: (
      override: ((executable: string) => string | undefined) | undefined,
    ) => void;
  };
  discovery.setFindExecutableOverrideForTest((executable: string) => `/usr/bin/${executable}`);

  return proxyquire.noCallThru()('../../interpreter/interpreterConfig', {
    vscode: vscodeMock,
    './interpreterDiscovery': discovery,
  }) as {
    getInterpreters: () => LanguageInterpreter[];
    getInterpreterForLanguage: (languageId: string) => LanguageInterpreter | undefined;
    saveInterpreters: (interpreters: LanguageInterpreter[]) => Promise<void>;
  };
}

describe('interpreterConfig', () => {
  afterEach(() => {
    sinon.restore();
    const discovery = proxyquire.noCallThru()('../../interpreter/interpreterDiscovery', {}) as {
      setFindExecutableOverrideForTest: (
        override: ((executable: string) => string | undefined) | undefined,
      ) => void;
    };
    discovery.setFindExecutableOverrideForTest(undefined);
  });

  it('returns configured interpreters from workspace settings', () => {
    const custom = [{ languageId: 'go', label: 'Go', path: 'go' }];
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': custom },
    });
    const { getInterpreters } = loadInterpreterConfigModule(vscodeMock);

    const interpreters = getInterpreters();
    expect(interpreters[0]).to.deep.equal(custom[0]);
    expect(interpreters.some((item) => item.languageId === 'javascript')).to.be.true;
  });

  it('falls back to locally available default interpreters when setting is missing', () => {
    const vscodeMock = createVscodeMock();
    const { getInterpreters } = loadInterpreterConfigModule(vscodeMock);

    const interpreters = getInterpreters();
    expect(interpreters.map((item) => item.languageId)).to.include.members([
      'javascript',
      'python',
      'html',
    ]);
    expect(interpreters.find((item) => item.languageId === 'javascript')?.path).to.equal('/usr/bin/node');
  });

  it('appends available defaults to explicit user configuration', () => {
    const custom = [{ languageId: 'go', label: 'Go', path: 'go' }];
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': custom },
    });
    const { getInterpreters } = loadInterpreterConfigModule(vscodeMock);

    const interpreters = getInterpreters();
    expect(interpreters[0]).to.deep.equal(custom[0]);
    expect(interpreters.some((item) => item.languageId === 'javascript')).to.be.true;
    expect(interpreters.some((item) => item.languageId === 'html')).to.be.true;
  });

  it('finds interpreter by language id', () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': DEFAULT_INTERPRETERS },
    });
    const { getInterpreterForLanguage } = loadInterpreterConfigModule(vscodeMock);

    const interpreter = getInterpreterForLanguage('python');
    expect(interpreter).to.deep.equal({
      languageId: 'python',
      label: 'Python',
      path: 'python',
    });
  });

  it('returns undefined for unknown language id', () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': DEFAULT_INTERPRETERS },
    });
    const { getInterpreterForLanguage } = loadInterpreterConfigModule(vscodeMock);

    expect(getInterpreterForLanguage('ruby')).to.be.undefined;
  });

  it('persists interpreters to global configuration', async () => {
    const vscodeMock = createVscodeMock();
    const { saveInterpreters, getInterpreters } = loadInterpreterConfigModule(vscodeMock);
    const next = [{ languageId: 'rust', path: 'rustc' }];

    await saveInterpreters(next);
    const interpreters = getInterpreters();
    expect(interpreters[0]).to.deep.equal(next[0]);
    expect(interpreters.some((item) => item.languageId === 'javascript')).to.be.true;
  });
});
