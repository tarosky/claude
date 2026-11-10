// ビルドの Node 指定、ビルドツール、Node 24 で問題になる依存、
// 「設定されているのに効いていない」ことが多い箇所を検出する。
// 使い方: node detect_node.mjs [--path=<repo>]
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const pathArg = process.argv.slice(2).find((a) => a.startsWith('--path='));
const cwd = resolve(pathArg ? pathArg.slice('--path='.length) : process.cwd());

async function readSafe(p) {
  try {
    return await readFile(join(cwd, p), 'utf-8');
  } catch {
    return null;
  }
}

async function exists(p) {
  try {
    await stat(join(cwd, p));
    return true;
  } catch {
    return false;
  }
}

function git(args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function major(range) {
  const m = String(range || '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// Node 24 で動かない、または移行で出力が変わりうる依存。
// below: このメジャー未満なら該当。null なら依存していれば該当
const KNOWN = [
  { name: 'node-sass', below: null, note: 'ネイティブモジュールで Node 24 非対応。Dart Sass（sass）へ移行する。出力 CSS が変わりうるので比較必須' },
  { name: 'gulp-sass', below: 5, note: '4 以下は node-sass に依存。gulp-sass ^6 + sass に更新し、require("gulp-sass")(require("sass")) の形にする' },
  { name: 'gulp', below: 4, note: 'gulp 3 は新しい Node で動かない（primordials エラー）。gulp 4 以上へ' },
  { name: 'webpack', below: 5, note: 'webpack 4 は Node 17 以上で OpenSSL エラー（ERR_OSSL_EVP_UNSUPPORTED）。webpack 5 へ' },
  { name: 'webpack-stream', below: 7, note: '6 以下は webpack 4 を内包。webpack-stream 7 + webpack 5 へ' },
  { name: 'uglifyjs-webpack-plugin', below: null, note: 'webpack 5 では terser-webpack-plugin を使う' },
  { name: 'gulp-imagemin', below: null, note: '8 以上は ESM のみで gulpfile（CommonJS）から読めない。imagemin 系のネイティブバイナリも壊れやすい。使っていなければ削除、必要なら sharp + svgo を検討' },
  { name: 'imagemin', below: null, note: 'gulp-imagemin と同じ。使っていなければ削除' },
  { name: 'gulp-stylelint', below: null, note: '更新停止。stylelint の Node API を gulpfile から直接呼ぶ' },
  { name: 'fibers', below: null, note: 'Node 16 以上で動かない。Dart Sass では不要なので削除' },
  { name: 'grunt-sass', below: null, note: 'implementation に node-sass を使っていないか確認する' },
];

// 依存先のフレームワーク。Node 24 のブロッカーではないが、依存の更新範囲を決める（例: Bootstrap が @import を使う限り Sass モジュール化はできない）
const FRAMEWORKS = ['bootstrap', 'foundation-sites', 'bulma', '@wordpress/scripts', 'sass', 'jquery'];

const BUILD_TOOLS = {
  gulp: 'gulp', webpack: 'webpack', '@wordpress/scripts': 'wp-scripts', grunt: 'grunt', vite: 'vite',
  sass: 'sass', 'node-sass': 'node-sass', postcss: 'postcss', '@kunoichi/grab-deps': 'grab-deps', rollup: 'rollup', esbuild: 'esbuild',
};

async function run() {
  const pkgText = await readSafe('package.json');
  let pkg = null;
  try {
    pkg = pkgText ? JSON.parse(pkgText) : null;
  } catch {
    pkg = { _invalid: true };
  }
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

  // --- Node の指定箇所 ---
  const toolVersions = await readSafe('.tool-versions');
  const pins = {
    nodeVersionFile: (await readSafe('.node-version'))?.trim() || null,
    nvmrc: (await readSafe('.nvmrc'))?.trim() || null,
    toolVersions: toolVersions?.match(/^nodejs?\s+(\S+)/m)?.[1] || null,
    engines: pkg?.engines?.node || null,
    volta: pkg?.volta?.node || null,
    packageManager: pkg?.packageManager || null,
  };
  const workflowNode = [];
  let wfFiles = [];
  try {
    wfFiles = (await readdir(join(cwd, '.github/workflows'))).filter((f) => /\.ya?ml$/.test(f));
  } catch {
    // workflow なし
  }
  for (const f of wfFiles) {
    const t = await readSafe(`.github/workflows/${f}`);
    for (const m of t.matchAll(/node-version:\s*["']?([^\s"'#]+)/g)) workflowNode.push({ workflow: f, nodeVersion: m[1] });
    for (const m of t.matchAll(/node-version-file:\s*["']?([^\s"'#]+)/g)) workflowNode.push({ workflow: f, nodeVersionFile: m[1] });
  }
  const majors = [pins.nodeVersionFile, pins.nvmrc, pins.toolVersions, pins.volta, ...workflowNode.map((w) => w.nodeVersion)]
    .map(major).filter((x) => x !== null);
  const pinned = Boolean(pins.nodeVersionFile || pins.nvmrc || pins.toolVersions || pins.volta);

  // --- lockfile ---
  const gitignore = (await readSafe('.gitignore')) || '';
  const lock = {
    npm: await exists('package-lock.json'),
    yarn: await exists('yarn.lock'),
    pnpm: await exists('pnpm-lock.yaml'),
    ignoredInGit: /^\/?package-lock\.json\s*$/m.test(gitignore),
  };

  // --- ビルドツールと問題のある依存 ---
  const buildTools = Object.entries(BUILD_TOOLS).filter(([k]) => deps[k]).map(([k, v]) => ({ tool: v, version: deps[k] }));
  const blockers = KNOWN.filter((k) => deps[k.name] && (k.below === null || (major(deps[k.name]) ?? 0) < k.below))
    .map((k) => ({ name: k.name, version: deps[k.name], note: k.note }));
  const frameworks = FRAMEWORKS.filter((f) => deps[f]).map((f) => ({ name: f, version: deps[f] }));

  // --- 設定されているのに効いていないことが多い箇所 ---
  const configFiles = ['gulpfile.js', 'gulpfile.mjs', 'webpack.config.js', 'Gruntfile.js', 'vite.config.js', 'postcss.config.js'];
  const configs = {};
  for (const f of configFiles) {
    const t = await readSafe(f);
    if (t) configs[f] = t;
  }
  const all = Object.values(configs).join('\n') + '\n' + (pkgText || '');
  const hints = [];
  if (deps['gulp-plumber']) hints.push({ id: 'plumber', note: 'gulp-plumber はビルドエラーを握りつぶし、終了コード 0 で終わることがある。CI で「ビルド成功」に見えて実は失敗していないか、ログを確認する' });
  if (/quietDeps|silenceDeprecations/.test(all)) hints.push({ id: 'sass-silenced', note: 'Sass の非推奨警告を消している（quietDeps / silenceDeprecations）。警告は消さずに見える状態にする' });
  const outside = [...all.matchAll(/["'](\.\.\/[^"']+)["']/g)].map((m) => m[1]);
  if (outside.length) hints.push({ id: 'outside-repo-path', paths: [...new Set(outside)], note: 'リポジトリ外のパス（../）を参照している。CI にはそのディレクトリがないため、CI のビルドは失敗するか別の結果になる' });
  for (const f of ['bin/build.sh', 'bin/package.sh', 'build.sh']) {
    const t = await readSafe(f);
    if (t && /npm install(?!\s+-g)/.test(t)) hints.push({ id: 'npm-install', file: f, note: 'npm install ではなく npm ci を使う（lockfile 通りに入れる）' });
  }
  const committedBuild = ['dist', 'build', 'assets/build', 'assets/dist']
    .map((d) => ({ dir: d, files: git(['ls-files', d]).split('\n').filter(Boolean).length }))
    .filter((d) => d.files > 0);
  if (committedBuild.length) hints.push({ id: 'committed-build', dirs: committedBuild, note: 'ビルド結果がコミットされている。リリースに含まれるのは CI のビルドか、コミット済みのファイルか確認する。変更前の比較元（ベースライン）としても使える' });
  if (pkg?.scripts?.lint) hints.push({ id: 'lint-exit-code', note: 'lint がエラーでも終了コード 0 で終わっていないか、実際に実行して確認する' });

  const result = {
    path: cwd,
    hasPackageJson: Boolean(pkg),
    node: {
      pins,
      workflowNode,
      pinned,
      lowestMajor: majors.length ? Math.min(...majors) : null,
      targetMet: pinned && majors.length > 0 && majors.every((m) => m >= 24),
    },
    lock,
    scripts: pkg?.scripts || {},
    buildTools,
    blockers,
    frameworks,
    hints,
    distignore: await exists('.distignore'),
  };
  console.log(JSON.stringify(result, null, 2));
}

run();
