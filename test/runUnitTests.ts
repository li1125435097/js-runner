import Mocha from 'mocha';
import * as path from 'path';

const mocha = new Mocha({
  ui: 'bdd',
  timeout: 10000,
  color: true,
});

const testsRoot = path.resolve(__dirname, 'unit');
mocha.addFile(path.join(testsRoot, 'interpreterConfig.test.js'));
mocha.addFile(path.join(testsRoot, 'types.test.js'));
mocha.addFile(path.join(testsRoot, 'terminalManager.test.js'));
mocha.addFile(path.join(testsRoot, 'npmScriptsProvider.test.js'));
mocha.addFile(path.join(testsRoot, 'runningScriptsProvider.test.js'));
mocha.addFile(path.join(testsRoot, 'languageInterpretersProvider.test.js'));

mocha.run((failures) => {
  process.exit(failures > 0 ? 1 : 0);
});
