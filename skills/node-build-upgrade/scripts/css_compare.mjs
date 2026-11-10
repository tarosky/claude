// 2 つの CSS を意味の上で比較する。圧縮の有無、色の表記（#fff / white / rgb）、
// 小数の桁、セレクタの並び順の違いは無視し、宣言単位で差分を出す。
// 使い方: node css_compare.mjs <old.css> <new.css> [--postcss-from=<node_modules を持つディレクトリ>]
// 終了コード: 0 = 差分なし、1 = 差分あり、2 = 実行エラー
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const from = (args.find((a) => a.startsWith('--postcss-from=')) || '').slice('--postcss-from='.length) || process.cwd();
if (files.length !== 2) {
  console.error('usage: node css_compare.mjs <old.css> <new.css> [--postcss-from=<dir>]');
  process.exit(2);
}

let postcss;
try {
  postcss = createRequire(join(resolve(from), 'package.json'))('postcss');
} catch {
  console.error(`postcss が見つかりません（${from}）。対象リポジトリで npm ci 済みか確認するか、--postcss-from を指定してください。`);
  process.exit(2);
}

// --- 正規化 ---
const named = { transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
const fmt = (c) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+(+c[3]).toFixed(3)})`;
const ch = (v) => (v.trim().endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v));

function normVal(v) {
  v = v.replace(/#([0-9a-f]{3,8})\b/gi, (m, h) => {
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return fmt([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a]);
  });
  v = v.replace(/rgba?\(([^)]*)\)/g, (m, a) => {
    const p = a.split(/[,/\s]+/).filter(Boolean);
    return fmt([ch(p[0]), ch(p[1]), ch(p[2]), p[3] === undefined ? 1 : (p[3].endsWith('%') ? parseFloat(p[3]) / 100 : p[3])]);
  });
  v = v.replace(/\b(transparent|white|black)\b/g, (m) => fmt(named[m]));
  v = v.replace(/(^|[^\d.])0+\.(\d)/g, '$1.$2').replace(/(\.\d*?)0+(?=\D|$)/g, '$1').replace(/\.(?=\D|$)/g, '');
  v = v.replace(/\\([0-9a-f]{1,6}) ?/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)));
  return v.replace(/\s*,\s*/g, ',').replace(/\s*\/\s*/g, '/').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

// 複合セレクタ内の順序（`a:hover[x]` と `a[x]:hover`）を揃える。
// 型セレクタ → クラス・ID・属性 → 疑似クラス → 疑似要素 の順に並べる
function normCompound(c) {
  const m = c.match(/^([a-zA-Z*][\w-]*|)(.*)$/);
  const tokens = [];
  let i = 0;
  const rest = m[2];
  while (i < rest.length) {
    let j = i + 1;
    if (rest[i] === '[') {
      j = rest.indexOf(']', i) + 1;
    } else {
      if (rest[i] === ':' && rest[i + 1] === ':') j = i + 2;
      while (j < rest.length && !'.#[:('.includes(rest[j])) j++;
      if (rest[j] === '(') {
        let depth = 0;
        for (; j < rest.length; j++) {
          if (rest[j] === '(') depth++;
          if (rest[j] === ')' && --depth === 0) { j++; break; }
        }
      }
    }
    tokens.push(rest.slice(i, j));
    i = j;
  }
  const rank = (t) => (t.startsWith('::') ? 3 : t.startsWith(':') ? 2 : 1);
  return m[1] + tokens.sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? a.localeCompare(b) : 0)).join('');
}

// 括弧の外にある結合子（空白 > ~ +）で区切り、各複合セレクタを正規化する
function normComplex(sel) {
  const parts = [];
  let buf = '';
  let depth = 0;
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && ' >~+'.includes(ch)) {
      if (buf) parts.push(normCompound(buf));
      buf = '';
      if (ch !== ' ' || (parts.length && !' >~+'.includes(parts[parts.length - 1]))) parts.push(ch);
      continue;
    }
    buf += ch;
  }
  if (buf) parts.push(normCompound(buf));
  return parts.join('');
}

const normSel = (s) => s.split(/\s*,\s*/).map((x) => normComplex(x
  .replace(/\[([^=\]]+)=["']([^"']*)["']\]/g, '[$1=$2]')
  .replace(/\s*([>~+])\s*/g, '$1')
  .replace(/::?(before|after)/g, '::$1')
  .trim())).filter((x, i, all) => all.indexOf(x) === i).sort().join(',');

function declarations(file) {
  const out = [];
  postcss.parse(readFileSync(file, 'utf-8')).walkDecls((d) => {
    const ctx = [];
    let p = d.parent;
    while (p && p.type !== 'root') {
      ctx.unshift(p.type === 'rule'
        ? normSel(p.selector)
        : `@${p.name} ${p.params.replace(/\)\s*and\s*\(/g, ') and (').replace(/\s+/g, ' ')}`);
      p = p.parent;
    }
    out.push(`${ctx.join(' | ')} | ${d.prop}:${normVal(d.value)}${d.important ? '!important' : ''}`);
  });
  return out;
}

// --- 比較（色は ±2、小数は 2 桁まで同一視） ---
function hsl2rgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function canon(line) {
  const nums = [];
  line = line.replace(/hsla?\(([^)]*)\)/g, (m, a) => {
    const p = a.split(',').map(parseFloat);
    return `rgba(${hsl2rgb(p[0], p[1], p[2]).join(',')},${p[3] === undefined ? 1 : p[3]})`;
  });
  line = line.replace(/rgba\(([^)]*)\)/g, (m, a) => {
    nums.push(...a.split(',').map(Number));
    return 'C';
  });
  line = line.replace(/(\d*\.\d+)/g, (m) => String(+(+m).toFixed(2)));
  return { line, key: line, nums };
}

const oldDecls = declarations(files[0]);
const newDecls = declarations(files[1]);
const a = oldDecls.map(canon);
const bucket = new Map();
for (const x of newDecls.map(canon)) {
  if (!bucket.has(x.key)) bucket.set(x.key, []);
  bucket.get(x.key).push(x);
}
const onlyOld = [];
for (const x of a) {
  const list = bucket.get(x.key) || [];
  const i = list.findIndex((y) => y.nums.every((n, j) => Math.abs(n - x.nums[j]) <= 2.01));
  if (i >= 0) list.splice(i, 1);
  else onlyOld.push(x);
}
const onlyNew = [...bucket.values()].flat();
const show = (x) => {
  const nums = [...x.nums];
  return x.key.replace(/C/g, () => `rgba(${nums.splice(0, 4).map((n) => +n.toFixed(1)).join(',')})`);
};

// --- セレクタだけが違う宣言（@extend の結果が変わった場合など） ---
const split = (l) => {
  const i = l.lastIndexOf(' | ');
  const ctx = l.slice(0, i).split(' | ');
  return { sel: ctx.pop(), pre: ctx.join(' | '), decl: l.slice(i + 3) };
};
const selectorChanges = [];
const seen = new Set();
for (const x of onlyOld.map((o) => split(show(o)))) {
  const y = onlyNew.map((n) => split(show(n))).find((n) => n.pre === x.pre && n.decl === x.decl);
  if (!y) continue;
  const sa = new Set(x.sel.split(',')), sb = new Set(y.sel.split(','));
  const removed = [...sa].filter((s) => !sb.has(s));
  const added = [...sb].filter((s) => !sa.has(s));
  const k = `${removed.join()}|${added.join()}`;
  if (seen.has(k)) continue;
  seen.add(k);
  selectorChanges.push({ example: x.decl, removed, added });
}

// 同じセレクタ（＋@media など）の宣言をまとめて表示する
function grouped(list, mark) {
  const groups = new Map();
  for (const x of list) {
    const { sel, pre, decl } = split(show(x));
    const ctx = (pre ? `${pre} | ` : '') + sel;
    if (!groups.has(ctx)) groups.set(ctx, []);
    groups.get(ctx).push(decl);
  }
  for (const [ctx, decls] of groups) {
    const head = ctx.length > 160 ? `${ctx.slice(0, 160)}…（セレクタ ${ctx.split(',').length} 個）` : ctx;
    console.log(`  ${mark} ${head}`);
    console.log(`      { ${decls.join('; ').slice(0, 300)} }`);
  }
}

console.log(`宣言数: old ${oldDecls.length} / new ${newDecls.length}`);
console.log(`old にだけある宣言 (${onlyOld.length}):`);
grouped(onlyOld, '<');
console.log(`new にだけある宣言 (${onlyNew.length}):`);
grouped(onlyNew, '>');
if (selectorChanges.length) {
  console.log(`セレクタだけが違う宣言 (${selectorChanges.length}):`);
  for (const c of selectorChanges) {
    console.log(`  例: ${c.example.slice(0, 120)}`);
    console.log(`    削除: ${JSON.stringify(c.removed)}`);
    console.log(`    追加: ${JSON.stringify(c.added)}`);
  }
}
process.exit(onlyOld.length || onlyNew.length ? 1 : 0);
