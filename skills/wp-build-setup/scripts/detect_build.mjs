import { stat, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const cwd = process.cwd();

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

function makeItem(exists, path = null, recommendation = null) {
  return { exists, path, recommendation };
}

async function detect() {
  const pkgPath = resolve(cwd, 'package.json');
  const pkg = await readJsonSafe(pkgPath);

  const devDeps = (pkg && pkg.devDependencies) || {};
  const scripts = (pkg && pkg.scripts) || {};

  const items = {};

  // 1. grabDeps
  const hasGrabDeps = '@kunoichi/grab-deps' in devDeps;
  items.grabDeps = makeItem(
    hasGrabDeps,
    hasGrabDeps ? pkgPath : null,
    hasGrabDeps ? null : 'Install @kunoichi/grab-deps for WordPress-aware JS bundling.'
  );

  // 2. sassDep
  const hasSass = 'sass' in devDeps;
  items.sassDep = makeItem(
    hasSass,
    hasSass ? pkgPath : null,
    hasSass ? null : 'Install sass for SCSS compilation.'
  );

  // 3. postcssDeps
  const hasPostcss = 'postcss' in devDeps;
  const hasPostcssCli = 'postcss-cli' in devDeps;
  const hasAutoprefixer = 'autoprefixer' in devDeps;
  const allPostcss = hasPostcss && hasPostcssCli && hasAutoprefixer;
  const missingPostcss = [];
  if (!hasPostcss) missingPostcss.push('postcss');
  if (!hasPostcssCli) missingPostcss.push('postcss-cli');
  if (!hasAutoprefixer) missingPostcss.push('autoprefixer');
  items.postcssDeps = makeItem(
    allPostcss,
    allPostcss ? pkgPath : null,
    allPostcss ? null : `Install missing PostCSS dependencies: ${missingPostcss.join(', ')}.`
  );

  // 4. wpScriptsDep
  const hasWpScripts = '@wordpress/scripts' in devDeps;
  items.wpScriptsDep = makeItem(
    hasWpScripts,
    hasWpScripts ? pkgPath : null,
    hasWpScripts ? null : 'Install @wordpress/scripts if building Gutenberg blocks.'
  );

  // 5. buildJsScript
  const hasBuildJs = 'build:js' in scripts;
  items.buildJsScript = makeItem(
    hasBuildJs,
    hasBuildJs ? pkgPath : null,
    hasBuildJs ? null : 'Add a build:js script to package.json.'
  );

  // 6. buildCssScript
  const hasBuildCss = 'build:css' in scripts;
  items.buildCssScript = makeItem(
    hasBuildCss,
    hasBuildCss ? pkgPath : null,
    hasBuildCss ? null : 'Add a build:css script to package.json.'
  );

  // 7. buildBlocksScript
  const hasBuildBlocks = 'build:blocks' in scripts;
  items.buildBlocksScript = makeItem(
    hasBuildBlocks,
    hasBuildBlocks ? pkgPath : null,
    hasBuildBlocks ? null : 'Add a build:blocks script if the project includes Gutenberg blocks.'
  );

  // 8. packageScript
  const hasPackage = 'package' in scripts;
  items.packageScript = makeItem(
    hasPackage,
    hasPackage ? pkgPath : null,
    hasPackage ? null : 'Add a package script that runs all build steps.'
  );

  // 9. dumpScript
  const hasDump = 'dump' in scripts;
  items.dumpScript = makeItem(
    hasDump,
    hasDump ? pkgPath : null,
    hasDump ? null : 'Add a dump script for grab-deps manifest generation.'
  );

  // 10. srcJsDir
  const srcJsPath = resolve(cwd, 'src/js');
  const srcJsStat = await statSafe(srcJsPath);
  const hasSrcJs = srcJsStat !== null && srcJsStat.isDirectory();
  items.srcJsDir = makeItem(
    hasSrcJs,
    hasSrcJs ? srcJsPath : null,
    hasSrcJs ? null : 'Create src/js/ directory for JavaScript source files.'
  );

  // 11. srcScssDir
  const srcScssPath = resolve(cwd, 'src/scss');
  const srcScssStat = await statSafe(srcScssPath);
  const hasSrcScss = srcScssStat !== null && srcScssStat.isDirectory();
  items.srcScssDir = makeItem(
    hasSrcScss,
    hasSrcScss ? srcScssPath : null,
    hasSrcScss ? null : 'Create src/scss/ directory for SCSS source files.'
  );

  // 12. srcBlocksDir
  const srcBlocksPath = resolve(cwd, 'src/blocks');
  const srcBlocksStat = await statSafe(srcBlocksPath);
  const hasSrcBlocks = srcBlocksStat !== null && srcBlocksStat.isDirectory();
  items.srcBlocksDir = makeItem(
    hasSrcBlocks,
    hasSrcBlocks ? srcBlocksPath : null,
    hasSrcBlocks ? null : 'Create src/blocks/ directory if the project includes Gutenberg blocks.'
  );

  // 13. wpDependenciesJson
  const wpDepsPath = resolve(cwd, 'wp-dependencies.json');
  const wpDepsStat = await statSafe(wpDepsPath);
  const hasWpDeps = wpDepsStat !== null && wpDepsStat.isFile();
  items.wpDependenciesJson = makeItem(
    hasWpDeps,
    hasWpDeps ? wpDepsPath : null,
    hasWpDeps ? null : 'Run grab-deps dump to generate wp-dependencies.json.'
  );

  // 14. buildScript
  const buildShPath = resolve(cwd, 'bin/build.sh');
  const buildShStat = await statSafe(buildShPath);
  const hasBuildSh = buildShStat !== null && buildShStat.isFile();
  items.buildScript = makeItem(
    hasBuildSh,
    hasBuildSh ? buildShPath : null,
    hasBuildSh ? null : 'Create bin/build.sh for CI/CD release builds.'
  );

  // 15. watchConfig
  const hasWatchKey = pkg && typeof pkg.watch === 'object' && pkg.watch !== null;
  const hasNpmWatch = 'npm-watch' in devDeps;
  const hasWatch = hasWatchKey || hasNpmWatch;
  items.watchConfig = makeItem(
    hasWatch,
    hasWatch ? pkgPath : null,
    hasWatch ? null : 'Set up npm-watch for development file watching.'
  );

  const output = {
    tool: { name: 'detect_build', version: '0.1.0' },
    repoRoot: cwd,
    items,
  };

  process.stdout.write(JSON.stringify(output, null, 2));
}

detect().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
