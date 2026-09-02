import { expect } from 'chai';
import * as sinon from 'sinon';
import { DEFAULT_INTERPRETERS } from '../helpers/constants';
import { loadLanguageInterpretersProviderModule } from '../helpers/loadModules';
import { createVscodeMock } from '../helpers/vscodeMock';

describe('LanguageInterpretersProvider', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('lists configured interpreters', () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': DEFAULT_INTERPRETERS },
    });
    const { LanguageInterpretersProvider } = loadLanguageInterpretersProviderModule(vscodeMock);
    const provider = new LanguageInterpretersProvider();

    const children = provider.getChildren();
    expect(children.map((item: { label?: string }) => item.label)).to.include('Python');
    provider.dispose();
  });

  it('adds a new interpreter through input boxes', async () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': [...DEFAULT_INTERPRETERS] },
      inputBoxResponses: ['go', 'Go', 'go run'],
    });
    const { LanguageInterpretersProvider } = loadLanguageInterpretersProviderModule(vscodeMock);
    const provider = new LanguageInterpretersProvider();

    await provider.addInterpreter();

    const interpreters = vscodeMock.workspace.getConfiguration('jsRunner').get('interpreters') as Array<{
      languageId: string;
      label?: string;
      path: string;
    }>;
    expect(interpreters).to.deep.include({ languageId: 'go', label: 'Go', path: 'go run' });
    provider.dispose();
  });

  it('rejects duplicate language id when adding interpreter', async () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': [...DEFAULT_INTERPRETERS] },
      inputBoxResponses: ['python'],
    });
    const { LanguageInterpretersProvider } = loadLanguageInterpretersProviderModule(vscodeMock);
    const provider = new LanguageInterpretersProvider();
    vscodeMock.window.showInputBox.callsFake(
      async (options: { validateInput?: (value: string) => string | undefined }) => {
        const error = options.validateInput?.('python');
        expect(error).to.match(/already exists/);
        return undefined;
      },
    );

    await provider.addInterpreter();
    provider.dispose();
  });

  it('edits an existing interpreter', async () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': [...DEFAULT_INTERPRETERS] },
      inputBoxResponses: ['Python 3', 'python3'],
    });
    const { LanguageInterpretersProvider, LanguageInterpreterTreeItem } =
      loadLanguageInterpretersProviderModule(vscodeMock);
    const provider = new LanguageInterpretersProvider();
    const item = new LanguageInterpreterTreeItem({
      languageId: 'python',
      label: 'Python',
      path: 'python',
    });

    await provider.editInterpreter(item);

    const interpreters = vscodeMock.workspace.getConfiguration('jsRunner').get('interpreters') as Array<{
      languageId: string;
      label?: string;
      path: string;
    }>;
    expect(interpreters).to.deep.include({
      languageId: 'python',
      label: 'Python 3',
      path: 'python3',
    });
    provider.dispose();
  });

  it('removes interpreter after confirmation', async () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.interpreters': [...DEFAULT_INTERPRETERS] },
      warningMessageResponses: ['Remove'],
    });
    const { LanguageInterpretersProvider, LanguageInterpreterTreeItem } =
      loadLanguageInterpretersProviderModule(vscodeMock);
    const provider = new LanguageInterpretersProvider();
    const item = new LanguageInterpreterTreeItem({
      languageId: 'python',
      label: 'Python',
      path: 'python',
    });

    await provider.removeInterpreter(item);

    const interpreters = vscodeMock.workspace.getConfiguration('jsRunner').get('interpreters') as Array<{
      languageId: string;
    }>;
    expect(interpreters.some((entry) => entry.languageId === 'python')).to.be.false;
    provider.dispose();
  });
});
