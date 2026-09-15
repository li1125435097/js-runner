import { expect } from 'chai';
import * as proxyquire from 'proxyquire';

function loadKeys() {
  return proxyquire.noCallThru()('../../shortcuts/scriptShortcutKeys', {}) as {
    CATALOG_KEYS: Array<{ keyId: string }>;
    catalogKeysForPicker: (
      group: 'function' | 'recommended' | 'recommendedExtra',
      input: {
        bindings: Record<string, { packageKey: string; scriptName: string; source: 'catalog' | 'custom' }>;
        userBindings: Array<{ key: string; command: string }>;
      },
      currentKeyId: string | undefined,
    ) => Array<{ keyId: string }>;
    contextKeyFor: (keyId: string) => string;
    formatKeyLabel: (keyId: string) => string;
    inspectKey: (
      keyId: string,
      input: {
        bindings: Record<string, { packageKey: string; scriptName: string; source: 'catalog' | 'custom' }>;
        userBindings: Array<{ key: string; command: string }>;
      },
    ) => { kind: string; scriptRef?: string; commandId?: string; label: string };
    isCatalogKey: (keyId: string) => boolean;
    parseKeybinding: (input: string) => { ok: boolean; keyId?: string; error?: string };
  };
}

describe('scriptShortcutKeys', () => {
  it('normalizes custom keybindings to vscode modifier order', () => {
    const { parseKeybinding } = loadKeys();
    expect(parseKeybinding('Ctrl+Shift+B')).to.deep.equal({ ok: true, keyId: 'ctrl+shift+b' });
    expect(parseKeybinding('ctrl+alt+shift+f5')).to.deep.equal({
      ok: true,
      keyId: 'ctrl+shift+alt+f5',
    });
    expect(parseKeybinding('f7')).to.deep.equal({ ok: true, keyId: 'f7' });
  });

  it('rejects invalid, chord, and reserved-adjacent syntax', () => {
    const { parseKeybinding } = loadKeys();
    expect(parseKeybinding('')).to.include({ ok: false });
    expect(parseKeybinding('ctrl+k ctrl+s')).to.include({ ok: false });
    expect(parseKeybinding('ctrl+')).to.include({ ok: false });
    expect(parseKeybinding('ctrl+unknownkey')).to.include({ ok: false });
  });

  it('builds catalog context keys and treats extra combos as catalog keys', () => {
    const { CATALOG_KEYS, contextKeyFor, formatKeyLabel, isCatalogKey } = loadKeys();
    expect(contextKeyFor('ctrl+alt+f5')).to.equal('jsRunner.shortcut.ctrlAltF5');
    expect(contextKeyFor('ctrl+shift+alt+f5')).to.equal('jsRunner.shortcut.ctrlShiftAltF5');
    expect(formatKeyLabel('ctrl+alt+f5')).to.equal('Ctrl+Alt+F5');
    expect(isCatalogKey('ctrl+alt+f5')).to.be.true;
    expect(isCatalogKey('ctrl+shift+b')).to.be.false;
    expect(CATALOG_KEYS.some((item) => item.keyId === 'f4')).to.be.false;
    expect(CATALOG_KEYS.some((item) => item.keyId === 'ctrl+shift+alt+f1')).to.be.true;
  });

  it('marks default F5 as occupied and ctrl+alt+f5 as free', () => {
    const { inspectKey } = loadKeys();
    const input = { bindings: {}, userBindings: [] };
    expect(inspectKey('f5', input).kind).to.equal('default');
    expect(inspectKey('ctrl+alt+f5', input).kind).to.equal('free');
    expect(inspectKey('f4', input).kind).to.equal('reserved');
    expect(inspectKey('alt+f4', input).kind).to.equal('reserved');
    expect(inspectKey('f7', input).kind).to.equal('free');
  });

  it('detects script, user, and default conflicts', () => {
    const { inspectKey } = loadKeys();
    const input = {
      bindings: {
        'ctrl+alt+f5': { packageKey: '.', scriptName: 'dev', source: 'catalog' as const },
      },
      userBindings: [{ key: 'Ctrl+Shift+B', command: 'workbench.action.toggleSidebarVisibility' }],
    };
    expect(inspectKey('ctrl+alt+f5', input)).to.include({
      kind: 'script',
      scriptRef: '.::dev',
    });
    expect(inspectKey('ctrl+shift+b', input)).to.include({
      kind: 'user',
      commandId: 'workbench.action.toggleSidebarVisibility',
    });
    expect(inspectKey('ctrl+s', input).kind).to.equal('default');
  });

  it('ignores our own keybinding entries and unbind records', () => {
    const { inspectKey } = loadKeys();
    const input = {
      bindings: {},
      userBindings: [
        { key: 'ctrl+alt+f6', command: 'jsRunner.runNpmScriptByShortcut' },
        { key: 'f5', command: '-workbench.action.debug.start' },
      ],
    };
    expect(inspectKey('ctrl+alt+f6', input).kind).to.equal('free');
  });

  it('omits default-occupied F keys from unused list and keeps recommended combos', () => {
    const { catalogKeysForPicker } = loadKeys();
    const input = {
      bindings: {
        'ctrl+alt+f6': { packageKey: 'pkg', scriptName: 'test', source: 'catalog' as const },
      },
      userBindings: [{ key: 'ctrl+alt+f7', command: 'editor.action.marker.next' }],
    };
    const unused = catalogKeysForPicker('function', input, undefined).map((item) => item.keyId);
    expect(unused).to.include('f7');
    expect(unused).to.not.include('f5');
    expect(unused).to.not.include('f4');

    const recommended = catalogKeysForPicker('recommended', input, undefined).map((item) => item.keyId);
    expect(recommended).to.include('ctrl+alt+f5');
    expect(recommended).to.include('ctrl+alt+f6');
    expect(recommended).to.not.include('ctrl+alt+f7');
    expect(catalogKeysForPicker('recommended', input, 'ctrl+alt+f5').map((item) => item.keyId)).to.not.include(
      'ctrl+alt+f5',
    );
  });
});
