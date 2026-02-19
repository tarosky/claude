import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');

async function readFileSafe(filePath) {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*"?(.+?)"?\s*$/);
    if (m) result[m[1]] = m[2];
  }
  return result;
}

async function getSkills() {
  const skillsDir = resolve(rootDir, 'skills');
  const entries = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMd = await readFileSafe(join(skillsDir, entry.name, 'SKILL.md'));
    if (!skillMd) continue;
    const fm = parseFrontmatter(skillMd);
    skills.push({
      name: fm.name || entry.name,
      description: fm.description || '',
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

async function getCommands() {
  const commandsDir = resolve(rootDir, 'commands');
  const entries = await readdir(commandsDir).catch(() => []);
  const commands = [];

  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    const content = await readFileSafe(join(commandsDir, file));
    if (!content) continue;
    const name = basename(file, '.md');
    // 最初の段落（見出し以外）を説明文として抽出
    const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    const description = lines[0] || '';
    commands.push({ name, description });
  }
  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

function buildTree(skills, commands) {
  let tree = '```\n.\n';
  tree += '├── commands/          # カスタムコマンド（.md）\n';
  commands.forEach((c, i) => {
    const prefix = i === commands.length - 1 ? '└──' : '├──';
    tree += `│   ${prefix} ${c.name}.md\n`;
  });
  tree += '├── scripts/           # ユーティリティスクリプト\n';
  tree += '│   ├── install.sh\n';
  tree += '│   └── sync-readme.mjs\n';
  tree += '├── skills/            # スキル定義\n';
  skills.forEach((s, i) => {
    const isLast = i === skills.length - 1;
    const prefix = isLast ? '└──' : '├──';
    const bar = isLast ? ' ' : '│';
    tree += `│   ${prefix} ${s.name}/\n`;
    tree += `│   ${bar}   └── SKILL.md (+ scripts/, references/)\n`;
  });
  tree += '├── CLAUDE.md          # プロジェクトレベルの開発方針\n';
  tree += '├── README.md\n';
  tree += '└── .gitignore\n';
  tree += '```';
  return tree;
}

function replaceSection(content, marker, replacement) {
  const regex = new RegExp(
    `(<!-- BEGIN:${marker} -->\\n)[\\s\\S]*?(<!-- END:${marker} -->)`,
    'm'
  );
  return content.replace(regex, `$1${replacement}\n$2`);
}

async function main() {
  const [skills, commands] = await Promise.all([getSkills(), getCommands()]);

  let readme = await readFile(resolve(rootDir, 'README.md'), 'utf-8');

  // ディレクトリ構造
  readme = replaceSection(readme, 'DIRECTORY_TREE', buildTree(skills, commands));

  // コマンド一覧
  let cmdTable = '| コマンド | 説明 |\n|---------|------|\n';
  for (const c of commands) {
    cmdTable += `| \`${c.name}\` | ${c.description} |\n`;
  }
  readme = replaceSection(readme, 'COMMANDS', cmdTable.trimEnd());

  // スキル一覧
  let skillTable = '| スキル | 説明 |\n|-------|------|\n';
  for (const s of skills) {
    skillTable += `| \`${s.name}\` | ${s.description} |\n`;
  }
  readme = replaceSection(readme, 'SKILLS', skillTable.trimEnd());

  await writeFile(resolve(rootDir, 'README.md'), readme);
  console.log(`README.md updated: ${commands.length} commands, ${skills.length} skills`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
