import { expect } from 'chai';
import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import { DEFAULT_INTERPRETERS } from '../helpers/constants';
import { createVscodeMock } from '../helpers/vscodeMock';

describe('interpreterConfig', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('returns configured interpreters from workspace settings', () => {
    const custom = [{ languageId: 'go', label: 'Go', path: 'go' }];
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': custom },
    });
    const { getInterpreters } = proxyquire.noCallThru()('../../interpreterConfig', {
      vscode: vscodeMock,
    });

    expect(getInterpreters()).to.deep.equal(custom);
  });

  it('falls back to default interpreters when setting is missing', () => {
    const vscodeMock = createVscodeMock();
    const { getInterpreters } = proxyquire.noCallThru()('../../interpreterConfig', {
      vscode: vscodeMock,
    });

    expect(getInterpreters()).to.deep.equal(DEFAULT_INTERPRETERS);
  });

  it('finds interpreter by language id', () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': DEFAULT_INTERPRETERS },
    });
    const { getInterpreterForLanguage } = proxyquire.noCallThru()('../../interpreterConfig', {
      vscode: vscodeMock,
    });

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
    const { getInterpreterForLanguage } = proxyquire.noCallThru()('../../interpreterConfig', {
      vscode: vscodeMock,
    });

    expect(getInterpreterForLanguage('ruby')).to.be.undefined;
  });

  it('persists interpreters to global configuration', async () => {
    const vscodeMock = createVscodeMock();
    const { saveInterpreters, getInterpreters } = proxyquire.noCallThru()('../../interpreterConfig', {
      vscode: vscodeMock,
    });
    const next = [{ languageId: 'rust', path: 'rustc' }];

    await saveInterpreters(next);
    expect(getInterpreters()).to.deep.equal(next);
  });
});
