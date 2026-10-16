import { expect } from 'chai';
import { loadPackageJsonScriptsCodeLensProviderModule } from '../helpers/loadModules';
import { createVscodeMock } from '../helpers/vscodeMock';

function positionAt(text: string, offset: number): { line: number; character: number } {
  const before = text.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

function createDocument(fsPath: string, text: string) {
  return {
    uri: { fsPath },
    getText: () => text,
    positionAt: (offset: number) => positionAt(text, offset),
  };
}

describe('PackageJsonScriptsCodeLensProvider', () => {
  it('adds run and debug lenses above js scripts and run only for other scripts', () => {
    const vscodeMock = createVscodeMock();
    const {
      PackageJsonScriptsCodeLensProvider,
      PACKAGE_JSON_RUN_LENS_TITLE,
      PACKAGE_JSON_DEBUG_LENS_TITLE,
    } = loadPackageJsonScriptsCodeLensProviderModule(vscodeMock);
    const provider = new PackageJsonScriptsCodeLensProvider();
    const text = `{
  "scripts": {
    "dev": "vite",
    "lint": "echo lint"
  }
}`;

    const lenses = provider.provideCodeLenses(createDocument('/workspace/package.json', text));

    expect(lenses.map((lens) => lens.command?.title)).to.deep.equal([
      PACKAGE_JSON_RUN_LENS_TITLE,
      PACKAGE_JSON_DEBUG_LENS_TITLE,
      PACKAGE_JSON_RUN_LENS_TITLE,
    ]);
    expect(lenses[0].command).to.deep.include({
      command: 'jsRunner.runNpmScript',
    });
    expect(lenses[1].command).to.deep.include({
      command: 'jsRunner.debugNpmScript',
    });
    expect(lenses[0].command?.arguments?.[0]).to.deep.include({
      name: 'dev',
      command: 'vite',
      packageJsonPath: '/workspace/package.json',
    });
    expect(lenses[0].range.start.line).to.equal(lenses[1].range.start.line);
    expect(lenses[2].command?.arguments?.[0]).to.deep.include({ name: 'lint' });
    provider.dispose();
  });

  it('skips node_modules package.json and honors the enabled setting', () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.packageJsonCodeLens.enabled': false },
    });
    const { PackageJsonScriptsCodeLensProvider } =
      loadPackageJsonScriptsCodeLensProviderModule(vscodeMock);
    const provider = new PackageJsonScriptsCodeLensProvider();
    const text = '{"scripts":{"dev":"vite"}}';

    expect(
      provider.provideCodeLenses(createDocument('/workspace/package.json', text)),
    ).to.deep.equal([]);

    vscodeMock.__configurationStore.set('jsRunner.packageJsonCodeLens.enabled', true);
    expect(
      provider.provideCodeLenses(
        createDocument('/workspace/node_modules/pkg/package.json', text),
      ),
    ).to.deep.equal([]);
    provider.dispose();
  });

  it('refreshes lenses when the setting or package.json text changes', () => {
    const vscodeMock = createVscodeMock();
    const { PackageJsonScriptsCodeLensProvider } =
      loadPackageJsonScriptsCodeLensProviderModule(vscodeMock);
    const provider = new PackageJsonScriptsCodeLensProvider();
    let refreshCount = 0;
    provider.onDidChangeCodeLenses(() => {
      refreshCount += 1;
    });

    vscodeMock.workspace.__emitConfigurationChange('jsRunner.packageJsonCodeLens');
    vscodeMock.workspace.__emitTextDocumentChange('/workspace/package.json');
    vscodeMock.workspace.__emitTextDocumentChange('/workspace/src/index.ts');

    expect(refreshCount).to.equal(2);
    provider.dispose();
  });
});
