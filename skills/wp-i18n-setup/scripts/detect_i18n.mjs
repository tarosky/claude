import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const cwd = process.cwd();

function statSafe(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function readFileSafe(filePath) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function existsDir(dirPath) {
  const s = statSafe(dirPath);
  return s !== null && s.isDirectory();
}

function findMainPluginFile() {
  const entries = readdirSync(cwd);
  for (const entry of entries) {
    if (!entry.endsWith('.php')) continue;
    const fullPath = join(cwd, entry);
    const s = statSafe(fullPath);
    if (!s || !s.isFile()) continue;
    const content = readFileSafe(fullPath);
    if (content && /Plugin Name:/i.test(content)) {
      return { file: entry, content };
    }
  }
  return null;
}

function parseHeader(content, headerName) {
  const regex = new RegExp(`^\\s*\\*?\\s*${headerName}:\\s*(.+)$`, 'mi');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function scanPhpFilesForPattern(dir, pattern, recursive = true) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'vendor' || entry === '.git') continue;
    const fullPath = join(dir, entry);
    const s = statSafe(fullPath);
    if (!s) continue;
    if (s.isDirectory() && recursive) {
      results.push(...scanPhpFilesForPattern(fullPath, pattern, recursive));
    } else if (s.isFile() && entry.endsWith('.php')) {
      const content = readFileSafe(fullPath);
      if (content && pattern.test(content)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function findFilesWithExtension(dir, ext) {
  if (!existsDir(dir)) return [];
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry.endsWith(ext)) {
      results.push(join(dir, entry));
    }
  }
  return results;
}

// Main detection
const mainPlugin = findMainPluginFile();
const mainContent = mainPlugin ? mainPlugin.content : null;

const textDomainHeader = mainContent ? parseHeader(mainContent, 'Text Domain') : null;
const domainPathHeader = mainContent ? parseHeader(mainContent, 'Domain Path') : null;
const pluginURI = mainContent ? parseHeader(mainContent, 'Plugin URI') : null;

const isWordPressOrgPlugin = pluginURI ? /wordpress\.org/i.test(pluginURI) : false;

const languagesDir = join(cwd, 'languages');
const hasLanguagesDir = existsDir(languagesDir);

const potFilesInLanguages = hasLanguagesDir ? findFilesWithExtension(languagesDir, '.pot') : [];
const potFilesInRoot = findFilesWithExtension(cwd, '.pot');
const allPotFiles = [...potFilesInLanguages, ...potFilesInRoot];

const loadTextdomainFiles = scanPhpFilesForPattern(cwd, /load_plugin_textdomain\s*\(/);

const poFiles = hasLanguagesDir ? findFilesWithExtension(languagesDir, '.po') : [];
const moFiles = hasLanguagesDir ? findFilesWithExtension(languagesDir, '.mo') : [];

const items = {
  textDomain: {
    exists: textDomainHeader !== null,
    path: mainPlugin ? mainPlugin.file : null,
    recommendation: textDomainHeader === null ? 'Add "Text Domain: your-plugin-slug" to the main plugin file header.' : null,
  },
  domainPath: {
    exists: domainPathHeader !== null,
    path: mainPlugin ? mainPlugin.file : null,
    recommendation: domainPathHeader === null ? 'Add "Domain Path: /languages" to the main plugin file header.' : null,
  },
  languagesDir: {
    exists: hasLanguagesDir,
    path: hasLanguagesDir ? languagesDir : null,
    recommendation: !hasLanguagesDir ? 'Create a languages/ directory in the plugin root.' : null,
  },
  potFile: {
    exists: allPotFiles.length > 0,
    path: allPotFiles.length > 0 ? allPotFiles[0] : null,
    recommendation: allPotFiles.length === 0 ? 'Generate a POT file using: wp i18n make-pot . languages/your-plugin.pot' : null,
  },
  loadTextdomain: {
    exists: loadTextdomainFiles.length > 0,
    path: loadTextdomainFiles.length > 0 ? loadTextdomainFiles[0] : null,
    recommendation: loadTextdomainFiles.length === 0 ? 'Add load_plugin_textdomain() call on the plugins_loaded hook.' : null,
  },
  poFiles: {
    exists: poFiles.length > 0,
    path: poFiles.length > 0 ? poFiles[0] : null,
    recommendation: null,
  },
  moFiles: {
    exists: moFiles.length > 0,
    path: moFiles.length > 0 ? moFiles[0] : null,
    recommendation: null,
  },
};

const result = {
  tool: { name: 'detect_i18n', version: '0.1.0' },
  repoRoot: resolve(cwd),
  isWordPressOrgPlugin,
  pluginSlug: textDomainHeader || null,
  mainPluginFile: mainPlugin ? mainPlugin.file : null,
  items,
};

process.stdout.write(JSON.stringify(result, null, 2));
