#!/usr/bin/env node
/**
 * template/eyecatch.html のプレースホルダーをタイトル・モチーフで置換し、
 * Playwright(ヘッドレスChromium)でビューポート1600x900のスクリーンショットを撮る。
 *
 * 使い方:
 *   node scripts/render.mjs \
 *     --template template/eyecatch.html \
 *     --title "WordPressのアカウント管理ルールの作り方｜権限設計・退職時対応・社内浸透のポイント" \
 *     --motif-svg output/<slug>/source/motif.svg \
 *     --out output/<slug>/eyecatch-master.png \
 *     --html-out output/<slug>/source/eyecatch.html
 *
 *   タイトルは全角「｜」(または半角"|")で主題とサブに自動分割する。
 *   明示したい場合は --subtitle を併用する（--title側の｜以降は無視される）。
 *
 * ブランドアセット（references/logo.svg・references/bg.svg）はテンプレートからの
 * 相対パスで自動的に埋め込まれる。差し替えたい場合のみ --logo / --bg を指定する。
 *
 * モチーフの指定（どちらか一方。省略すると文字だけのレイアウトになる）:
 *   --motif-svg <file>  SVGファイルの中身をそのまま埋め込む（文字を含めないこと）
 *   --motif <file>      画像を <img> で読み込む（画像生成AIの出力を使う場合）
 *
 * フォントサイズはテンプレート側の __fitText() が実測して自動調整する。
 * 収まりきらなかった場合はこのスクリプトが警告を出すので、握りつぶさないこと。
 *
 * 依存: playwright。スキルディレクトリに node_modules が無い場合は、
 *   PLAYWRIGHT_MODULES=/path/to/some-project/node_modules
 * を指定すれば既存プロジェクトのインストール済みplaywrightを借用できる
 * （その playwright のバージョンに対応するChromiumがキャッシュ済みである必要がある）。
 *
 * ImageMagickでのSVG/HTMLラスタライズは信用しない(wp-org-assetsスキルの教訓と同じ)。
 * 文字組み・レイアウトは必ず実ブラウザにレンダリングさせる。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, "")] = argv[i + 1];
  }
  return args;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch (err) {
    const dir = process.env.PLAYWRIGHT_MODULES;
    if (!dir) {
      throw new Error(
        "playwright を解決できません。`npm install playwright` するか、" +
          "PLAYWRIGHT_MODULES に既存プロジェクトの node_modules のパスを指定してください。"
      );
    }
    const entry = pathToFileURL(resolve(dir, "playwright/index.mjs")).href;
    return (await import(entry)).chromium;
  }
}

/** SVGファイルをHTMLに埋め込める形にして読む。XML宣言・DOCTYPEは落とす。 */
async function inlineSvg(path) {
  const svg = await readFile(resolve(path), "utf8");
  return svg.replace(/<\?xml[^>]*\?>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "").trim();
}

async function buildMotif(args) {
  if (args["motif-svg"]) {
    return inlineSvg(args["motif-svg"]);
  }
  if (args.motif) {
    return `<img src="${pathToFileURL(resolve(args.motif)).href}" alt="">`;
  }
  return "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const key of ["template", "title", "out", "html-out"]) {
    if (!args[key]) {
      console.error(`Missing required --${key}`);
      process.exit(1);
    }
  }

  const [rawTitle, rawSub] = String(args.title).split(/[｜|]/);
  const title = rawTitle.trim();
  const subtitle = (args.subtitle ?? rawSub ?? "").trim();

  const templatePath = resolve(args.template);
  // ブランドアセットは template/ の隣の references/ にある
  const refDir = resolve(dirname(templatePath), "..", "references");
  const logoPath = args.logo ? resolve(args.logo) : resolve(refDir, "logo.svg");
  const bgPath = args.bg ? resolve(args.bg) : resolve(refDir, "bg.svg");

  let html = await readFile(templatePath, "utf8");
  html = html.replaceAll("{{TITLE}}", escapeHtml(title));
  html = html.replaceAll("{{SUBTITLE}}", escapeHtml(subtitle));
  html = html.replaceAll("{{MOTIF}}", await buildMotif(args));
  html = html.replaceAll("{{LOGO}}", await inlineSvg(logoPath));
  html = html.replaceAll("{{BG}}", await inlineSvg(bgPath));

  const htmlOutPath = resolve(args["html-out"]);
  const outPath = resolve(args.out);
  await mkdir(dirname(htmlOutPath), { recursive: true });
  await writeFile(htmlOutPath, html, "utf8");
  await mkdir(dirname(outPath), { recursive: true });

  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(htmlOutPath).href, { waitUntil: "networkidle" });
    // Webフォント読み込み待ち。フォント確定前に測ると行数計算がずれる。
    await page.evaluate(() => document.fonts.ready);
    const fit = await page.evaluate(() => window.__fitText && window.__fitText());
    if (fit) {
      for (const part of Object.values(fit)) {
        if (!part) continue;
        console.log(`fit ${part.selector}: ${part.size}px / ${part.lines}行`);
        if (!part.fitted) {
          console.warn(
            `警告: ${part.selector} が最小サイズでも規定行数に収まりませんでした。` +
              `タイトルを短くするか、template/eyecatch.html のレイアウトを見直してください。`
          );
        }
      }
      // フォントサイズ変更をレイアウトに反映させる
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1600, height: 900 } });
  } finally {
    await browser.close();
  }

  console.log(`Rendered: ${outPath}`);
  console.log(`Source HTML saved: ${htmlOutPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
