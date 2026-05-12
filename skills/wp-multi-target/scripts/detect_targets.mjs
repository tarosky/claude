#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
let root = process.cwd();
for (const a of args) {
  if (a.startsWith('--root=')) root = resolve(a.slice('--root='.length));
}
root = resolve(root);

const IGNORE = new Set([
  'node_modules', 'vendor', '.git', '.github', '.wordpress-org',
  'bin', 'tests', 'test', 'languages', 'assets', 'src', 'dist',
  'build', '.cache', '.idea', '.vscode',
]);

async function statSafe(p) {
  try { return await stat(p); } catch { return null; }
}

async function readSafe(p) {
  try { return await readFile(p, 'utf-8'); } catch { return null; }
}

async function listDirs(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && !IGNORE.has(e.name) && !e.name.startsWith('.'))
    .map((e) => join(dir, e.name));
}

async function listFiles(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  return entries.filter((e) => e.isFile()).map((e) => join(dir, e.name));
}

function parseHeader(content, name) {
  const re = new RegExp(`^\\s*\\*?\\s*${name}:\\s*(.+)$`, 'mi');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

async function inspectPlugin(dir) {
  const files = await listFiles(dir);
  for (const f of files) {
    if (!f.endsWith('.php')) continue;
    const content = await readSafe(f);
    if (content && /^\s*\*?\s*Plugin Name:/im.test(content)) {
      const name = parseHeader(content, 'Plugin Name') || basename(dir);
      const textDomain = parseHeader(content, 'Text Domain');
      return {
        type: 'plugin',
        isBlockTheme: false,
        path: dir,
        relativePath: relative(root, dir) || '.',
        slug: textDomain || basename(dir),
        name,
        mainFile: basename(f),
      };
    }
  }
  return null;
}

async function inspectTheme(dir) {
  const stylePath = join(dir, 'style.css');
  const s = await statSafe(stylePath);
  if (!s || !s.isFile()) return null;
  const content = await readSafe(stylePath);
  if (!content) return null;
  const themeName = parseHeader(content, 'Theme Name');
  if (!themeName) return null;
  const textDomain = parseHeader(content, 'Text Domain');
  const themeJson = await statSafe(join(dir, 'theme.json'));
  const templates = await statSafe(join(dir, 'templates'));
  const isBlockTheme = !!(themeJson && themeJson.isFile()) ||
    !!(templates && templates.isDirectory());
  return {
    type: 'theme',
    isBlockTheme,
    path: dir,
    relativePath: relative(root, dir) || '.',
    slug: textDomain || basename(dir),
    name: themeName,
    mainFile: 'style.css',
  };
}

async function inspectTarget(dir) {
  return (await inspectPlugin(dir)) || (await inspectTheme(dir));
}

async function scanContainer(dir, expectType) {
  const subs = await listDirs(dir);
  const results = [];
  for (const sub of subs) {
    const t = await inspectTarget(sub);
    if (t && (!expectType || t.type === expectType)) results.push(t);
  }
  return results;
}

async function detect() {
  const rootStat = await statSafe(root);
  if (!rootStat || !rootStat.isDirectory()) {
    return { shape: 'unknown', repoRoot: root, targets: [], reason: 'root is not a directory' };
  }

  const selfTarget = await inspectTarget(root);
  if (selfTarget) {
    let shape = selfTarget.type === 'plugin' ? 'single-plugin' : 'single-theme';
    return { shape, repoRoot: root, targets: [selfTarget] };
  }

  const wpContent = join(root, 'wp-content');
  const wpContentStat = await statSafe(wpContent);
  if (wpContentStat && wpContentStat.isDirectory()) {
    const plugins = await scanContainer(join(wpContent, 'plugins'), 'plugin');
    const themes = await scanContainer(join(wpContent, 'themes'), 'theme');
    const targets = [...plugins, ...themes];
    return { shape: 'mixed', repoRoot: root, targets };
  }

  const pluginsDir = join(root, 'plugins');
  const themesDir = join(root, 'themes');
  const pluginsStat = await statSafe(pluginsDir);
  const themesStat = await statSafe(themesDir);
  if ((pluginsStat && pluginsStat.isDirectory()) || (themesStat && themesStat.isDirectory())) {
    const plugins = pluginsStat ? await scanContainer(pluginsDir, 'plugin') : [];
    const themes = themesStat ? await scanContainer(themesDir, 'theme') : [];
    const targets = [...plugins, ...themes];
    return { shape: 'mixed', repoRoot: root, targets };
  }

  const subTargets = await scanContainer(root);
  if (subTargets.length > 0) {
    const onlyPlugins = subTargets.every((t) => t.type === 'plugin');
    const onlyThemes = subTargets.every((t) => t.type === 'theme');
    const shape = onlyPlugins ? 'multi-plugin' : onlyThemes ? 'multi-theme' : 'mixed';
    return { shape, repoRoot: root, targets: subTargets };
  }

  return { shape: 'unknown', repoRoot: root, targets: [] };
}

detect()
  .then((result) => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  })
  .catch((err) => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  });
