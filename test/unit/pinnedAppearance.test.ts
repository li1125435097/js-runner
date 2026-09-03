import { expect } from 'chai';
import { loadPinnedAppearanceModule } from '../helpers/loadModules';
import { createVscodeMock } from '../helpers/vscodeMock';

describe('pinnedAppearance', () => {
  it('uses default pin color when unset or invalid', () => {
    const vscodeMock = createVscodeMock();
    const appearance = loadPinnedAppearanceModule(vscodeMock) as {
      DEFAULT_PINNED_FOREGROUND: string;
      getPinnedForeground: () => string;
    };

    expect(appearance.getPinnedForeground()).to.equal(appearance.DEFAULT_PINNED_FOREGROUND);
    expect(appearance.DEFAULT_PINNED_FOREGROUND).to.equal('#E75480');

    vscodeMock.__configurationStore.set('jsRunner.pinnedForeground', 'not-a-color');
    expect(appearance.getPinnedForeground()).to.equal('#E75480');
  });

  it('reads pin color from configuration', () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.pinnedForeground': '#abc' },
    });
    const appearance = loadPinnedAppearanceModule(vscodeMock) as {
      getPinnedForeground: () => string;
    };

    expect(appearance.getPinnedForeground()).to.equal('#aabbcc');
  });

  it('decorates pinned URIs with the pin theme color', () => {
    const vscodeMock = createVscodeMock();
    const appearance = loadPinnedAppearanceModule(vscodeMock) as {
      PINNED_FOREGROUND_COLOR_ID: string;
      PinnedDecorationProvider: new () => {
        provideFileDecoration: (uri: { scheme: string }) => { color?: { id: string }; propagate?: boolean } | undefined;
      };
      pinnedPackageUri: (packageJsonPath: string) => { scheme: string };
      pinnedScriptUri: (packageJsonPath: string, scriptName: string) => { scheme: string };
    };

    const provider = new appearance.PinnedDecorationProvider();
    const packageUri = appearance.pinnedPackageUri('/workspace/package.json');
    const scriptUri = appearance.pinnedScriptUri('/workspace/package.json', 'build');

    expect(provider.provideFileDecoration(packageUri)?.color?.id).to.equal(
      appearance.PINNED_FOREGROUND_COLOR_ID,
    );
    expect(provider.provideFileDecoration(scriptUri)?.propagate).to.equal(false);
    expect(provider.provideFileDecoration({ scheme: 'file' })).to.equal(undefined);
  });

  it('writes explicit pin color into global color customizations', async () => {
    const vscodeMock = createVscodeMock({
      configuration: { 'jsRunner.pinnedForeground': '#ff00aa' },
    });
    const appearance = loadPinnedAppearanceModule(vscodeMock) as {
      syncPinnedForegroundColorCustomization: () => Promise<void>;
    };

    await appearance.syncPinnedForegroundColorCustomization();

    expect(vscodeMock.__configurationStore.get('workbench.colorCustomizations')).to.deep.equal({
      'jsRunner.pinnedForeground': '#ff00aa',
    });
  });

  it('does not write color customizations when pin color is unset', async () => {
    const vscodeMock = createVscodeMock();
    const appearance = loadPinnedAppearanceModule(vscodeMock) as {
      syncPinnedForegroundColorCustomization: () => Promise<void>;
    };

    await appearance.syncPinnedForegroundColorCustomization();

    expect(vscodeMock.__configurationStore.has('workbench.colorCustomizations')).to.equal(false);
  });
});
