import Mocha from 'mocha';
import * as path from 'path';

const mocha = new Mocha({
  ui: 'bdd',
  timeout: 10000,
  color: true,
});

const testsRoot = path.resolve(__dirname, 'unit');
mocha.addFile(path.join(testsRoot, 'terminalCommand.test.js'));
mocha.addFile(path.join(testsRoot, 'interpreterDiscovery.test.js'));
mocha.addFile(path.join(testsRoot, 'htmlFileOpener.test.js'));
mocha.addFile(path.join(testsRoot, 'interpreterConfig.test.js'));
mocha.addFile(path.join(testsRoot, 'types.test.js'));
mocha.addFile(path.join(testsRoot, 'terminalManager.test.js'));
mocha.addFile(path.join(testsRoot, 'npmScriptDebug.test.js'));
mocha.addFile(path.join(testsRoot, 'packageManager.test.js'));
mocha.addFile(path.join(testsRoot, 'registryConfig.test.js'));
mocha.addFile(path.join(testsRoot, 'installedPackagesPanel.test.js'));
mocha.addFile(path.join(testsRoot, 'npmScriptsProvider.test.js'));
mocha.addFile(path.join(testsRoot, 'runningScriptsProvider.test.js'));
mocha.addFile(path.join(testsRoot, 'languageInterpretersProvider.test.js'));

mocha.run((failures) => {
  process.exit(failures > 0 ? 1 : 0);
});
