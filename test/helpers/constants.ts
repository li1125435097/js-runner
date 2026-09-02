export const DEFAULT_INTERPRETERS = [
  { languageId: 'shellscript', label: 'Bash', path: 'bash' },
  { languageId: 'java', label: 'Java', path: 'java' },
  { languageId: 'javascript', label: 'JavaScript', path: 'node' },
  { languageId: 'javascriptreact', label: 'JavaScript React', path: 'node' },
  { languageId: 'python', label: 'Python', path: 'python' },
  { languageId: 'typescript', label: 'TypeScript', path: 'node --experimental-strip-types' },
  { languageId: 'html', label: 'HTML', path: 'default browser' },
];

export const fixtureWorkspaceRoot = (): string => {
  // Compiled tests live in dist/test/**; fixtures stay in test/fixtures/**
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolve, dirname } = require('path') as typeof import('path');
  return resolve(dirname(__filename), '../../../test/fixtures/workspace');
};
