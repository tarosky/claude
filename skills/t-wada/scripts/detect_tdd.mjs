import { stat, readFile, readdir } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';

const cwd = process.cwd();

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function statSafe(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

async function readFileSafe(filePath) {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function readJsonSafe(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function makeItem(exists, path = null, recommendation = null, detail = null) {
  return { exists, ...(path && { path }), ...(recommendation && { recommendation }), ...(detail && { detail }) };
}

async function dirExists(dirPath) {
  const s = await statSafe(dirPath);
  return s !== null && s.isDirectory();
}

async function fileExists(filePath) {
  const s = await statSafe(filePath);
  return s !== null && s.isFile();
}

async function firstExisting(paths) {
  for (const p of paths) {
    if (await fileExists(p)) return p;
  }
  return null;
}

async function firstExistingDir(paths) {
  for (const p of paths) {
    if (await dirExists(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// CI workflow scanner
// ---------------------------------------------------------------------------

async function detectCIWorkflows() {
  const workflowDir = resolve(cwd, '.github/workflows');
  if (!(await dirExists(workflowDir))) return [];

  const entries = await readdir(workflowDir).catch(() => []);
  const workflows = [];

  for (const entry of entries) {
    if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) continue;
    const fullPath = join(workflowDir, entry);
    const content = await readFileSafe(fullPath);
    if (!content) continue;

    const testKeywords = [
      'npm test', 'npm run test', 'npx jest', 'npx vitest',
      'composer test', 'phpunit', 'vendor/bin/phpunit',
      'pytest', 'python -m pytest',
      'go test', 'cargo test',
    ];
    const runsTests = testKeywords.some((kw) => content.includes(kw));
    workflows.push({ name: entry, path: fullPath, runsTests });
  }
  return workflows;
}

// ---------------------------------------------------------------------------
// Test file counter
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules', 'vendor', '.git', 'dist', 'build',
  '__pycache__', '.tox', '.mypy_cache', 'target',
]);

const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /Test\.php$/,
  /_test\.go$/,
  /^test_.*\.py$/,
  /_test\.py$/,
  /test_.*\.rs$/,
];

async function countTestFiles(dir = cwd, depth = 0, maxDepth = 5) {
  if (depth > maxDepth) return { count: 0, patterns: new Set() };

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { count: 0, patterns: new Set() };
  }

  let count = 0;
  const patterns = new Set();

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const sub = await countTestFiles(join(dir, entry.name), depth + 1, maxDepth);
      count += sub.count;
      for (const p of sub.patterns) patterns.add(p);
    } else if (entry.isFile()) {
      for (const pattern of TEST_FILE_PATTERNS) {
        if (pattern.test(entry.name)) {
          count++;
          patterns.add(pattern.source);
          break;
        }
      }
    }
  }
  return { count, patterns };
}

// ---------------------------------------------------------------------------
// Monorepo detection
// ---------------------------------------------------------------------------

async function detectMonorepo() {
  const pkg = await readJsonSafe(resolve(cwd, 'package.json'));
  const workspaces = (pkg && pkg.workspaces) || null;
  const pnpmWorkspace = await fileExists(resolve(cwd, 'pnpm-workspace.yaml'));
  const lerna = await fileExists(resolve(cwd, 'lerna.json'));

  const detected = !!(workspaces || pnpmWorkspace || lerna);
  const ws = Array.isArray(workspaces) ? workspaces : [];
  return { detected, workspaces: ws };
}

// ---------------------------------------------------------------------------
// Language detectors
// ---------------------------------------------------------------------------

async function detectJavaScript() {
  const pkgPath = resolve(cwd, 'package.json');
  const pkg = await readJsonSafe(pkgPath);
  if (!pkg) return null;

  const devDeps = pkg.devDependencies || {};
  const deps = pkg.dependencies || {};
  const allDeps = { ...deps, ...devDeps };
  const scripts = pkg.scripts || {};
  const items = {};

  // testFramework
  const frameworks = ['vitest', 'jest', 'mocha', 'ava', 'tap', '@jest/core'];
  const found = frameworks.find((f) => f in allDeps);
  items.testFramework = found
    ? makeItem(true, pkgPath, null, `${found}@${allDeps[found]}`)
    : makeItem(false, null, 'テストフレームワークが未導入です。新規プロジェクトにはVitestを推奨します。');

  // testConfig
  const configPaths = [
    'vitest.config.ts', 'vitest.config.js', 'vitest.config.mts',
    'jest.config.ts', 'jest.config.js', 'jest.config.mjs', 'jest.config.cjs',
    '.mocharc.yml', '.mocharc.json', '.mocharc.js',
  ];
  const configPath = await firstExisting(configPaths.map((c) => resolve(cwd, c)));
  const hasJestInPkg = pkg.jest !== undefined;
  items.testConfig = (configPath || hasJestInPkg)
    ? makeItem(true, configPath || pkgPath, null, configPath ? configPath.split('/').pop() : 'package.json (jest key)')
    : makeItem(false, null, 'テスト設定ファイルが見つかりません。');

  // testDirectory
  const testDirCandidates = ['__tests__', 'tests', 'test', 'spec'].map((d) => resolve(cwd, d));
  const testDir = await firstExistingDir(testDirCandidates);
  items.testDirectory = testDir
    ? makeItem(true, testDir)
    : makeItem(false, null, 'テストディレクトリが見つかりません。tests/ の作成を推奨します。');

  // testScript
  const hasTest = 'test' in scripts && scripts.test !== 'echo "Error: no test specified" && exit 1';
  items.testScript = hasTest
    ? makeItem(true, pkgPath, null, scripts.test)
    : makeItem(false, null, 'package.json に有効な test スクリプトがありません。');

  // coverageTool
  const coverageTools = ['c8', 'nyc', '@vitest/coverage-v8', '@vitest/coverage-istanbul', 'istanbul'];
  const coverageFound = coverageTools.find((t) => t in allDeps);
  items.coverageTool = coverageFound
    ? makeItem(true, pkgPath, null, coverageFound)
    : makeItem(false, null, 'カバレッジツールが未導入です。@vitest/coverage-v8 または c8 を推奨します。');

  // assertionLibrary
  const assertLibs = ['power-assert', 'espower-typescript', 'chai', 'expect.js', 'should'];
  const assertFound = assertLibs.find((a) => a in allDeps);
  items.assertionLibrary = assertFound
    ? makeItem(true, pkgPath, null, assertFound)
    : makeItem(false, null, 'アサーションライブラリが未導入です。power-assert の導入を検討してください。');

  // linter
  const linters = ['eslint', '@biomejs/biome', 'oxlint'];
  const linterFound = linters.find((l) => l in allDeps);
  items.linter = linterFound
    ? makeItem(true, pkgPath, null, linterFound)
    : makeItem(false, null, 'リンターが未導入です。ESLint または Biome を推奨します。');

  // typeChecker
  const hasTS = 'typescript' in allDeps || (await fileExists(resolve(cwd, 'tsconfig.json')));
  items.typeChecker = hasTS
    ? makeItem(true, await fileExists(resolve(cwd, 'tsconfig.json')) ? resolve(cwd, 'tsconfig.json') : pkgPath, null, 'typescript')
    : makeItem(false, null, 'TypeScriptが未導入です。型チェックはテストを補完します。');

  return { name: 'javascript', marker: 'package.json', items };
}

async function detectPHP() {
  const composerPath = resolve(cwd, 'composer.json');
  const composer = await readJsonSafe(composerPath);
  if (!composer) return null;

  const devDeps = composer['require-dev'] || {};
  const scripts = composer.scripts || {};
  const items = {};

  // testFramework
  const phpunitKey = Object.keys(devDeps).find((k) => k === 'phpunit/phpunit' || k === 'pestphp/pest' || k === 'codeception/codeception');
  items.testFramework = phpunitKey
    ? makeItem(true, composerPath, null, `${phpunitKey}:${devDeps[phpunitKey]}`)
    : makeItem(false, null, 'テストフレームワークが未導入です。PHPUnit の導入を推奨します。');

  // testConfig
  const phpunitConfigs = ['phpunit.xml', 'phpunit.xml.dist', 'phpunit.dist.xml'];
  const configPath = await firstExisting(phpunitConfigs.map((c) => resolve(cwd, c)));
  items.testConfig = configPath
    ? makeItem(true, configPath, null, configPath.split('/').pop())
    : makeItem(false, null, 'phpunit.xml が見つかりません。');

  // testDirectory
  const testDirCandidates = ['tests', 'test', 'Tests'].map((d) => resolve(cwd, d));
  const testDir = await firstExistingDir(testDirCandidates);
  items.testDirectory = testDir
    ? makeItem(true, testDir)
    : makeItem(false, null, 'テストディレクトリが見つかりません。tests/ の作成を推奨します。');

  // testScript
  const hasTest = 'test' in scripts || 'phpunit' in scripts;
  items.testScript = hasTest
    ? makeItem(true, composerPath, null, scripts.test || scripts.phpunit)
    : makeItem(false, null, 'composer.json に test スクリプトがありません。');

  // coverageTool
  const hasPcov = 'pcov' in devDeps || Object.keys(devDeps).some((k) => k.includes('pcov'));
  const configContent = configPath ? await readFileSafe(configPath) : '';
  const hasCoverageConfig = configContent && configContent.includes('<coverage');
  items.coverageTool = (hasPcov || hasCoverageConfig)
    ? makeItem(true, configPath || composerPath, null, hasPcov ? 'pcov' : 'phpunit coverage config')
    : makeItem(false, null, 'カバレッジが未設定です。pcov の導入を推奨します。');

  // assertionLibrary (PHPUnit built-in is standard)
  items.assertionLibrary = makeItem(true, null, null, 'PHPUnit built-in assertions');

  // linter / static analysis
  const analysisTools = ['phpstan/phpstan', 'vimeo/psalm', 'squizlabs/php_codesniffer', 'rector/rector'];
  const analysisFound = analysisTools.filter((t) => t in devDeps);
  items.linter = analysisFound.length > 0
    ? makeItem(true, composerPath, null, analysisFound.join(', '))
    : makeItem(false, null, '静的解析ツールが未導入です。PHPStan の導入を推奨します。');

  // typeChecker (PHPStan doubles as type checker for PHP)
  const hasPhpstan = 'phpstan/phpstan' in devDeps;
  items.typeChecker = hasPhpstan
    ? makeItem(true, composerPath, null, 'phpstan')
    : makeItem(false, null, 'PHPStanが未導入です。テストと静的解析は補完関係にあります。');

  // WordPress detection
  const isWordPress = Object.keys({ ...composer.require || {}, ...devDeps }).some(
    (k) => k.startsWith('wordpress/') || k.includes('wp-') || k === 'johnpbloch/wordpress-core'
  );
  const wpEnv = await fileExists(resolve(cwd, '.wp-env.json'));
  if (isWordPress || wpEnv) {
    items.wordpress = makeItem(true, null, null, 'WordPress project detected');
  }

  return { name: 'php', marker: 'composer.json', items };
}

async function detectPython() {
  const pyprojectPath = resolve(cwd, 'pyproject.toml');
  const setupPyPath = resolve(cwd, 'setup.py');
  const requirementsPath = resolve(cwd, 'requirements.txt');

  const hasPyproject = await fileExists(pyprojectPath);
  const hasSetupPy = await fileExists(setupPyPath);
  const hasRequirements = await fileExists(requirementsPath);

  if (!hasPyproject && !hasSetupPy && !hasRequirements) return null;

  const markerFile = hasPyproject ? 'pyproject.toml' : hasSetupPy ? 'setup.py' : 'requirements.txt';
  const markerPath = hasPyproject ? pyprojectPath : hasSetupPy ? setupPyPath : requirementsPath;
  const content = await readFileSafe(markerPath) || '';
  const items = {};

  // testFramework
  const hasPytest = content.includes('pytest');
  items.testFramework = hasPytest
    ? makeItem(true, markerPath, null, 'pytest')
    : makeItem(false, null, 'テストフレームワークが未導入です。pytest を推奨します。');

  // testConfig
  const pyConfigs = ['pytest.ini', 'setup.cfg', 'tox.ini'];
  const configPath = await firstExisting(pyConfigs.map((c) => resolve(cwd, c)));
  const hasPytestInPyproject = hasPyproject && content.includes('[tool.pytest');
  items.testConfig = (configPath || hasPytestInPyproject)
    ? makeItem(true, configPath || pyprojectPath, null, configPath ? configPath.split('/').pop() : 'pyproject.toml [tool.pytest]')
    : makeItem(false, null, 'pytest の設定が見つかりません。pyproject.toml への追加を推奨します。');

  // testDirectory
  const testDirCandidates = ['tests', 'test'].map((d) => resolve(cwd, d));
  const testDir = await firstExistingDir(testDirCandidates);
  items.testDirectory = testDir
    ? makeItem(true, testDir)
    : makeItem(false, null, 'テストディレクトリが見つかりません。tests/ の作成を推奨します。');

  // testScript
  const makefile = await readFileSafe(resolve(cwd, 'Makefile'));
  const hasTestTarget = makefile && /^test:/m.test(makefile);
  items.testScript = hasTestTarget
    ? makeItem(true, resolve(cwd, 'Makefile'), null, 'make test')
    : makeItem(false, null, 'テスト実行スクリプトがありません。Makefile に test ターゲットの追加を推奨します。');

  // coverageTool
  const hasCoverage = content.includes('coverage') || content.includes('pytest-cov');
  items.coverageTool = hasCoverage
    ? makeItem(true, markerPath, null, 'pytest-cov / coverage')
    : makeItem(false, null, 'カバレッジツールが未導入です。pytest-cov を推奨します。');

  // linter
  const linterNames = ['mypy', 'ruff', 'flake8', 'pylint', 'pyright'];
  const linterFound = linterNames.filter((l) => content.includes(l));
  items.linter = linterFound.length > 0
    ? makeItem(true, markerPath, null, linterFound.join(', '))
    : makeItem(false, null, 'リンター/型チェッカーが未導入です。ruff + mypy を推奨します。');

  items.typeChecker = content.includes('mypy') || content.includes('pyright')
    ? makeItem(true, markerPath, null, content.includes('mypy') ? 'mypy' : 'pyright')
    : makeItem(false, null, '型チェッカーが未導入です。mypy を推奨します。');

  return { name: 'python', marker: markerFile, items };
}

async function detectGo() {
  const goModPath = resolve(cwd, 'go.mod');
  if (!(await fileExists(goModPath))) return null;

  const content = await readFileSafe(goModPath) || '';
  const items = {};

  // testFramework (Go has built-in testing)
  items.testFramework = makeItem(true, null, null, 'go test (標準)');

  // testDirectory (Go uses same-package tests)
  const testFileResult = await countTestFiles();
  const goTestCount = testFileResult.patterns.has('_test\\.go$') ? testFileResult.count : 0;
  items.testDirectory = goTestCount > 0
    ? makeItem(true, null, null, `${goTestCount} test files found`)
    : makeItem(false, null, '_test.go ファイルが見つかりません。');

  // testScript
  const makefile = await readFileSafe(resolve(cwd, 'Makefile'));
  const hasTestTarget = makefile && /^test:/m.test(makefile);
  items.testScript = hasTestTarget
    ? makeItem(true, resolve(cwd, 'Makefile'), null, 'make test')
    : makeItem(false, null, 'Makefile に test ターゲットの追加を推奨します。');

  // coverageTool
  const hasCoverProfile = makefile && makefile.includes('-coverprofile');
  items.coverageTool = hasCoverProfile
    ? makeItem(true, resolve(cwd, 'Makefile'), null, 'go test -coverprofile')
    : makeItem(false, null, 'カバレッジプロファイルが未設定です。-coverprofile の追加を推奨します。');

  // linter
  const golangciConfig = await firstExisting(
    ['.golangci.yml', '.golangci.yaml', '.golangci.json', '.golangci.toml'].map((f) => resolve(cwd, f))
  );
  items.linter = golangciConfig
    ? makeItem(true, golangciConfig, null, 'golangci-lint')
    : makeItem(false, null, 'golangci-lint が未設定です。導入を推奨します。');

  // testify detection
  const hasTestify = content.includes('github.com/stretchr/testify');
  if (hasTestify) {
    items.assertionLibrary = makeItem(true, goModPath, null, 'testify');
  }

  return { name: 'go', marker: 'go.mod', items };
}

async function detectRust() {
  const cargoPath = resolve(cwd, 'Cargo.toml');
  if (!(await fileExists(cargoPath))) return null;

  const content = await readFileSafe(cargoPath) || '';
  const items = {};

  // testFramework (Rust has built-in testing)
  items.testFramework = makeItem(true, null, null, 'cargo test (標準)');

  // testDirectory (integration tests)
  const integrationTestDir = resolve(cwd, 'tests');
  items.testDirectory = (await dirExists(integrationTestDir))
    ? makeItem(true, integrationTestDir, null, 'tests/ (integration tests)')
    : makeItem(false, null, 'tests/ ディレクトリ（統合テスト用）が見つかりません。');

  // testScript
  const makefile = await readFileSafe(resolve(cwd, 'Makefile'));
  const hasTestTarget = makefile && /^test:/m.test(makefile);
  items.testScript = hasTestTarget
    ? makeItem(true, resolve(cwd, 'Makefile'), null, 'make test')
    : makeItem(true, cargoPath, null, 'cargo test（標準コマンド）');

  // coverageTool
  const hasTarpaulin = content.includes('tarpaulin');
  items.coverageTool = hasTarpaulin
    ? makeItem(true, cargoPath, null, 'cargo-tarpaulin')
    : makeItem(false, null, 'カバレッジツールが未設定です。cargo-tarpaulin を推奨します。');

  // linter (clippy)
  items.linter = makeItem(true, null, null, 'clippy (標準)');

  return { name: 'rust', marker: 'Cargo.toml', items };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function detect() {
  const languages = [];

  const detectors = [detectJavaScript, detectPHP, detectPython, detectGo, detectRust];
  const results = await Promise.all(detectors.map((d) => d()));
  for (const result of results) {
    if (result) languages.push(result);
  }

  const testFileResult = await countTestFiles();

  const output = {
    tool: { name: 'detect_tdd', version: '0.1.0' },
    repoRoot: cwd,
    languages,
    monorepo: await detectMonorepo(),
    testFiles: {
      count: testFileResult.count,
      patterns: [...testFileResult.patterns],
    },
    ciWorkflows: await detectCIWorkflows(),
  };

  process.stdout.write(JSON.stringify(output, null, 2));
}

detect().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
