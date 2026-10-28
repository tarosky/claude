// GitHub Actions の action ごとに、動作する Node ランタイムと更新先を調べる。
// 使い方: node detect_actions.mjs [--path=<repo>] [--repo=<owner/name>] [--no-runs]
// 出力: JSON（workflows / actions / summary）
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

function arg(name) {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}

const cwd = resolve(arg('path') || process.cwd());
const withRuns = !process.argv.includes('--no-runs');

function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function ghJson(path, jq) {
  const out = gh(['api', path, ...(jq ? ['--jq', jq] : [])]);
  if (out === null) return null;
  try {
    return JSON.parse(out);
  } catch {
    return out.trim();
  }
}

function repoSlug() {
  const fromArg = arg('repo');
  if (fromArg) return fromArg;
  try {
    const url = execFileSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], { encoding: 'utf-8' }).trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// --- workflow の解析（YAML ライブラリを使わない簡易パーサー） ---

const USES = /^\s*-?\s*uses:\s*["']?([^\s"'#]+)/gm;

function topLevelBlock(text, key) {
  const lines = text.split('\n');
  const re = new RegExp(`^["']?${key}["']?:\\s*(.*)$`);
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return null;
  const inline = lines[start].match(re)[1].replace(/#.*$/, '').trim();
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l) && !l.startsWith('#')) break;
    body.push(l);
  }
  return { inline, body };
}

function parseTriggers(text) {
  const block = topLevelBlock(text, 'on') || topLevelBlock(text, 'true');
  if (!block) return { events: [], pushTagsOnly: false };
  if (block.inline) {
    const events = block.inline.replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    return { events, pushTagsOnly: false };
  }
  const indent = Math.min(...block.body.filter((l) => l.trim() && !l.trim().startsWith('#')).map((l) => l.match(/^\s*/)[0].length));
  const events = [];
  let current = null;
  const sub = {};
  for (const l of block.body) {
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const ind = l.match(/^\s*/)[0].length;
    const m = l.trim().match(/^([\w-]+):/);
    // `on:` の下に `pull_request` や `- push` とだけ書く形式もある
    const bare = l.trim().match(/^(?:-\s*)?([\w-]+)\s*$/);
    if (ind === indent && (m || bare)) {
      current = (m || bare)[1];
      events.push(current);
      sub[current] = [];
    } else if (current && m) {
      sub[current].push(m[1]);
    }
  }
  const push = sub.push || [];
  const pushTagsOnly = events.includes('push') && push.includes('tags') && !push.includes('branches') && !push.includes('paths');
  return { events, pushTagsOnly };
}

// jobs: 配下をジョブごとに分け、ジョブ単位の if: がタグ／リリース時に限定しているかを調べる。
// PR で動く workflow でも、リリースジョブだけ `if: startsWith(github.ref, 'refs/tags/')` のことが多い。
const TAG_GATE = /refs\/tags|tags\/|ref_type\s*==\s*['"]tag|event_name\s*==\s*['"]release|github\.event\.release/;

function parseJobs(text) {
  const block = topLevelBlock(text, 'jobs');
  if (!block) return [];
  const lines = block.body.filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) return [];
  const indent = Math.min(...lines.map((l) => l.match(/^\s*/)[0].length));
  const jobs = [];
  for (const l of block.body) {
    const ind = l.match(/^\s*/)[0].length;
    const m = l.trim().match(/^([\w-]+):\s*$/);
    if (ind === indent && m) {
      jobs.push({ name: m[1], lines: [] });
    } else if (jobs.length) {
      jobs[jobs.length - 1].lines.push(l);
    }
  }
  return jobs.map((j) => {
    const body = j.lines.join('\n');
    const jobIndent = Math.min(...j.lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
    // ジョブ直下の if: だけを見る（ステップの if: は対象外）
    const ifLine = j.lines.find((l) => l.match(/^\s*/)[0].length === jobIndent && /^\s*if:/.test(l));
    const needs = (body.match(/^\s*needs:\s*(.+)$/m) || [])[1] || '';
    return {
      name: j.name,
      tagGated: Boolean(ifLine && TAG_GATE.test(ifLine)),
      needs: needs.replace(/[[\]'"\s]/g, '').split(',').filter(Boolean),
      uses: [...body.matchAll(USES)].map((m) => m[1]),
      tagGatedSteps: tagGatedStepUses(j.lines),
    };
  });
}

// ステップ単位の if: でタグ／リリース時に限定されている action を返す
function tagGatedStepUses(lines) {
  const steps = [];
  for (const l of lines) {
    if (/^\s*-\s/.test(l)) steps.push([]);
    if (steps.length) steps[steps.length - 1].push(l);
  }
  const gated = [];
  for (const s of steps) {
    const text = s.join('\n');
    const ifLine = s.find((l) => /^\s*-?\s*if:/.test(l));
    const uses = text.match(/^\s*-?\s*uses:\s*["']?([^\s"'#]+)/m);
    if (uses && ifLine && TAG_GATE.test(ifLine)) gated.push(uses[1]);
  }
  return gated;
}

// needs で連なるジョブも、前段がタグ限定ならタグ限定とみなす
function propagateTagGate(jobs) {
  const byName = new Map(jobs.map((j) => [j.name, j]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const j of jobs) {
      if (!j.tagGated && j.needs.some((n) => byName.get(n)?.tagGated)) {
        j.tagGated = true;
        changed = true;
      }
    }
  }
  return jobs;
}

// 更新後の動作をどこで確認できるか。良い順に PR > merge > dispatch > tag/release
function verification({ events, pushTagsOnly }) {
  const ev = new Set(events);
  if (ev.has('pull_request') || ev.has('pull_request_target')) return 'PR';
  if ((ev.has('push') && !pushTagsOnly) || ['schedule', 'issue_comment', 'issues', 'workflow_run', 'pull_request_review'].some((e) => ev.has(e))) return 'merge';
  if (ev.has('workflow_dispatch')) return 'dispatch';
  if (pushTagsOnly || ev.has('release')) return 'tag/release';
  if (ev.has('workflow_call')) return 'caller';
  return 'unknown';
}

// --- action の解決 ---

const cache = new Map();

function runtimeAt(owner, repo, sub, ref) {
  for (const fn of ['action.yml', 'action.yaml']) {
    const p = sub ? `${sub}/${fn}` : fn;
    const raw = gh(['api', `repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(ref)}`, '-H', 'Accept: application/vnd.github.raw']);
    if (raw !== null) {
      const m = raw.match(/^\s*using:\s*["']?([\w-]+)/m);
      return m ? m[1] : 'unknown';
    }
  }
  return null;
}

// 更新先のバージョン。メジャータグ（v7 など）の最大を優先する。
// 最新リリースのタグは使わない。codeql-action のように、別系統のタグ（codeql-bundle-v2.27.3）が最新リリースになっているリポジトリがあるため
function latestVersion(owner, repo, sub) {
  const out = gh(['api', '--paginate', `repos/${owner}/${repo}/git/matching-refs/tags/v`, '--jq', '.[].ref']);
  const tags = (out || '').split('\n').map((r) => r.replace('refs/tags/', '')).filter(Boolean);
  const majors = tags.filter((t) => /^v\d+$/.test(t)).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  if (majors.length) return { tag: majors[0], suggest: majors[0], runtime: runtimeAt(owner, repo, sub, majors[0]) };
  // メジャータグが無いリポジトリは、最新リリースのタグ（バージョン形式のものだけ）を使う
  const latestTag = ghJson(`repos/${owner}/${repo}/releases/latest`, '.tag_name');
  if (typeof latestTag !== 'string' || !/^v?\d+(\.\d+)*$/.test(latestTag)) return null;
  return { tag: latestTag, suggest: latestTag, runtime: runtimeAt(owner, repo, sub, latestTag) };
}

function resolveAction(ref) {
  if (cache.has(ref)) return cache.get(ref);
  const [path, version] = ref.split('@');
  const [owner, repo, ...rest] = path.split('/');
  const sub = rest.join('/');
  const meta = ghJson(`repos/${owner}/${repo}`, '{archived: .archived, default_branch: .default_branch}');
  const current = runtimeAt(owner, repo, sub, version);
  const latest = latestVersion(owner, repo, sub);
  const isBranchRef = meta && typeof meta === 'object' && (version === meta.default_branch || ['master', 'main'].includes(version));
  const result = {
    ref,
    archived: meta && typeof meta === 'object' ? meta.archived : null,
    notFound: meta === null,
    runtime: current,
    branchRef: Boolean(isBranchRef),
    latest,
  };
  result.status = classify(result);
  cache.set(ref, result);
  return result;
}

function classify(r) {
  if (r.notFound) return 'not-found';
  // tarosky/workflows はリリースを切らず @main で参照する運用。中身は tarosky/workflows 側で更新する
  if (r.ref.startsWith('tarosky/workflows/')) return 'ok';
  if (r.archived) return 'archived';
  if (r.runtime === 'node24' && !r.branchRef) return 'ok';
  if (r.runtime === 'docker' || r.runtime === 'composite') return r.branchRef ? 'pin-version' : 'check-manually';
  if (r.latest && r.latest.runtime === 'node24') return 'upgrade';
  if (r.branchRef) return 'pin-version';
  return 'no-node24-release';
}

// --- 直近の実行結果 ---

// workflow が有効か。active 以外（disabled_inactivity / disabled_manually など）は、PR を出しても実行されない
function workflowStates(slug) {
  if (!slug) return null;
  const list = ghJson(`repos/${slug}/actions/workflows?per_page=100`, '[.workflows[] | {path, state}]');
  if (!Array.isArray(list)) return null;
  return new Map(list.map((w) => [w.path.replace('.github/workflows/', ''), w.state]));
}

function lastRun(slug, file) {
  if (!slug || !withRuns) return null;
  const runs = ghJson(`repos/${slug}/actions/workflows/${file}/runs?per_page=30`, '[.workflow_runs[] | {c: .conclusion, e: .event, d: .created_at[:10]}]');
  if (!Array.isArray(runs)) return null;
  const real = runs.find((r) => r.c && !['skipped', 'cancelled', 'neutral'].includes(r.c));
  return real ? { conclusion: real.c, event: real.e, date: real.d } : { conclusion: 'never', event: null, date: null };
}

async function run() {
  const dir = join(cwd, '.github', 'workflows');
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => /\.ya?ml$/.test(f)).sort();
  } catch {
    // workflow なし
  }
  const slug = repoSlug();
  const states = workflowStates(slug);
  const workflows = [];
  const actions = new Map();

  const isAction = (u) => !u.startsWith('./') && !u.startsWith('docker://') && !u.includes('/.github/workflows/') && u.includes('@');

  for (const file of files) {
    const text = await readFile(join(dir, file), 'utf-8');
    const triggers = parseTriggers(text);
    const wfVerification = verification(triggers);
    const jobs = propagateTagGate(parseJobs(text)).map((j) => ({
      name: j.name,
      tagGated: j.tagGated,
      verification: j.tagGated ? 'tag/release' : wfVerification,
      actions: [...new Set(j.uses.filter(isAction))],
      tagGatedSteps: j.tagGated ? [] : [...new Set(j.tagGatedSteps.filter(isAction))],
      reusableWorkflows: j.uses.filter((u) => u.includes('/.github/workflows/')),
    }));
    const nodeVersions = [...text.matchAll(/node-version:\s*["']?([^\s"'#]+)/g)].map((m) => m[1]);
    const nodeVersionFile = /node-version-file:/.test(text);
    for (const job of jobs) {
      for (const r of job.actions) {
        if (!actions.has(r)) actions.set(r, { ...resolveAction(r), usedIn: [] });
        const v = job.tagGatedSteps.includes(r) ? 'tag/release' : job.verification;
        actions.get(r).usedIn.push({ workflow: file, job: job.name, verification: v });
      }
    }
    workflows.push({
      file,
      events: triggers.events,
      pushTagsOnly: triggers.pushTagsOnly,
      verification: wfVerification,
      state: states ? states.get(file) || 'unknown' : null,
      lastRun: lastRun(slug, file),
      jobs,
      nodeVersions,
      nodeVersionFile,
    });
  }

  const list = [...actions.values()].sort((a, b) => a.ref.localeCompare(b.ref));
  const needsWork = list.filter((a) => a.status !== 'ok');
  // 更新が必要な action を含むジョブごとに、どこで検証できるかをまとめる
  const affectedJobs = [];
  for (const w of workflows) {
    for (const j of w.jobs) {
      // check-manually（composite / docker）は中身を見るまで変更するか分からないので、検証可否の判定には含めない
      const refs = j.actions.filter((r) => !['ok', 'check-manually'].includes(actions.get(r).status));
      if (!refs.length) continue;
      const lr = w.lastRun ? w.lastRun.conclusion : null;
      // ジョブ内でも、タグ限定のステップにある action は分けて扱う
      const groups = [
        { job: j.name, verification: j.verification, refs: refs.filter((r) => !j.tagGatedSteps.includes(r)) },
        { job: `${j.name} (タグ限定ステップ)`, verification: 'tag/release', refs: refs.filter((r) => j.tagGatedSteps.includes(r)) },
      ];
      for (const g of groups) {
        if (!g.refs.length) continue;
        affectedJobs.push({
          workflow: w.file,
          job: g.job,
          verification: g.verification,
          state: w.state,
          lastRun: lr,
          // tag/release でしか動かない、workflow が無効、または直近が失敗・未実行なら、PR だけでは検証できない
          verifiableBeforeRelease: ['PR', 'merge', 'dispatch'].includes(g.verification)
            && (w.state === null || w.state === 'active')
            && !['failure', 'never'].includes(lr),
          actions: g.refs,
        });
      }
    }
  }
  const summary = {
    repo: slug,
    workflowCount: workflows.length,
    actionsNeedingWork: needsWork.length,
    byStatus: list.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {}),
    affectedJobs,
    allVerifiableBeforeRelease: affectedJobs.every((j) => j.verifiableBeforeRelease),
  };
  console.log(JSON.stringify({ summary, workflows, actions: list }, null, 2));
}

run();
