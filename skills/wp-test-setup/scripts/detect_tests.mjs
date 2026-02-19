import { stat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const cwd = resolve('.');

async function statSafe(filePath) {
  try {
    const s = await stat(filePath);
    return s;
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

async function detect() {
  const items = {};

  // 1. phpunitConfig
  const phpunitXmlDist = join(cwd, 'phpunit.xml.dist');
  const phpunitXml = join(cwd, 'phpunit.xml');
  const phpunitDistStat = await statSafe(phpunitXmlDist);
  const phpunitStat = await statSafe(phpunitXml);
  const phpunitPath = phpunitDistStat
    ? phpunitXmlDist
    : phpunitStat
      ? phpunitXml
      : null;
  items.phpunitConfig = {
    exists: phpunitPath !== null,
    path: phpunitPath,
    recommendation: phpunitPath ? null : 'Create phpunit.xml.dist with a testsuite pointing to tests/ directory.',
  };

  // 2. testBootstrap
  const bootstrapPath = join(cwd, 'tests', 'bootstrap.php');
  const bootstrapStat = await statSafe(bootstrapPath);
  items.testBootstrap = {
    exists: bootstrapStat !== null,
    path: bootstrapStat ? bootstrapPath : null,
    recommendation: bootstrapStat ? null : 'Create tests/bootstrap.php to load WordPress test environment and the plugin.',
  };

  // 3. wpEnvConfig
  const wpEnvPath = join(cwd, '.wp-env.json');
  const wpEnvStat = await statSafe(wpEnvPath);
  items.wpEnvConfig = {
    exists: wpEnvStat !== null,
    path: wpEnvStat ? wpEnvPath : null,
    recommendation: wpEnvStat ? null : 'Create .wp-env.json to configure the Docker-based WordPress dev environment.',
  };

  // 4-6. package.json checks
  const pkg = await readJsonSafe(join(cwd, 'package.json'));
  const scripts = pkg?.scripts || {};
  const devDeps = pkg?.devDependencies || {};

  // 4. npmTestScript
  const hasTestScript = typeof scripts.test === 'string';
  items.npmTestScript = {
    exists: hasTestScript,
    path: hasTestScript ? join(cwd, 'package.json') : null,
    recommendation: hasTestScript ? null : 'Add a "test" script to package.json to run PHPUnit inside wp-env.',
  };

  // 5. npmWpEnvScripts
  const hasStart = typeof scripts.start === 'string';
  const hasStop = typeof scripts.stop === 'string';
  const hasWpEnvScripts = hasStart && hasStop;
  items.npmWpEnvScripts = {
    exists: hasWpEnvScripts,
    path: hasWpEnvScripts ? join(cwd, 'package.json') : null,
    recommendation: hasWpEnvScripts ? null : 'Add "start" and "stop" scripts to package.json for wp-env lifecycle.',
  };

  // 6. wpEnvDependency
  const hasWpEnv = typeof devDeps['@wordpress/env'] === 'string';
  items.wpEnvDependency = {
    exists: hasWpEnv,
    path: hasWpEnv ? join(cwd, 'package.json') : null,
    recommendation: hasWpEnv ? null : 'Add @wordpress/env to devDependencies in package.json.',
  };

  // 7-8. composer.json checks
  const composer = await readJsonSafe(join(cwd, 'composer.json'));
  const requireDev = composer?.['require-dev'] || {};

  // 7. phpunitDependency
  const hasPhpunit = typeof requireDev['phpunit/phpunit'] === 'string';
  items.phpunitDependency = {
    exists: hasPhpunit,
    path: hasPhpunit ? join(cwd, 'composer.json') : null,
    recommendation: hasPhpunit ? null : 'Add phpunit/phpunit to require-dev in composer.json.',
  };

  // 8. phpunitPolyfills
  const hasPolyfills = typeof requireDev['yoast/phpunit-polyfills'] === 'string';
  items.phpunitPolyfills = {
    exists: hasPolyfills,
    path: hasPolyfills ? join(cwd, 'composer.json') : null,
    recommendation: hasPolyfills ? null : 'Add yoast/phpunit-polyfills to require-dev in composer.json.',
  };

  // 9. testsDirectory
  const testsDir = join(cwd, 'tests');
  const testsDirStat = await statSafe(testsDir);
  const testsDirExists = testsDirStat !== null && testsDirStat.isDirectory();
  items.testsDirectory = {
    exists: testsDirExists,
    path: testsDirExists ? testsDir : null,
    recommendation: testsDirExists ? null : 'Create a tests/ directory for PHPUnit test files.',
  };

  const result = {
    tool: { name: 'detect_tests', version: '0.1.0' },
    repoRoot: cwd,
    items,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

detect().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exitCode = 1;
});
