import { stat, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

function parsePathArg() {
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--path=')) return resolve(a.slice('--path='.length));
  }
  return process.cwd();
}

const cwd = parsePathArg();

async function statSafe(p) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

async function readFileSafe(p) {
  try {
    return await readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

async function existsDir(p) {
  const s = await statSafe(p);
  return s !== null && s.isDirectory();
}

async function getWorkflowFiles(workflowsDir) {
  try {
    const entries = await readdir(workflowsDir);
    return entries
      .filter((e) => e.endsWith('.yml') || e.endsWith('.yaml'))
      .map((e) => ({ name: e, path: join(workflowsDir, e) }));
  } catch {
    return [];
  }
}

async function scanWorkflows(files, testFn) {
  for (const file of files) {
    const content = await readFileSafe(file.path);
    if (content && testFn(file.name, content)) {
      return file;
    }
  }
  return null;
}

async function run() {
  const workflowsDir = join(cwd, '.github', 'workflows');
  const hasWorkflowsDir = await existsDir(workflowsDir);
  const workflowFiles = hasWorkflowsDir ? await getWorkflowFiles(workflowsDir) : [];

  // Read all workflow contents once
  const workflowContents = new Map();
  for (const wf of workflowFiles) {
    const content = await readFileSafe(wf.path);
    if (content) {
      workflowContents.set(wf.path, content);
    }
  }

  function scan(testFn) {
    for (const wf of workflowFiles) {
      const content = workflowContents.get(wf.path);
      if (content && testFn(wf.name, content)) {
        return { exists: true, path: wf.path, recommendation: null };
      }
    }
    return null;
  }

  // 1. workflowsDir
  const workflowsDirItem = {
    exists: hasWorkflowsDir,
    path: hasWorkflowsDir ? workflowsDir : null,
    recommendation: hasWorkflowsDir ? null : 'Create .github/workflows/ directory',
  };

  // 2. testWorkflow
  const testResult = scan((name, content) => {
    const nameLower = name.toLowerCase();
    return nameLower.includes('test') || nameLower.includes('phpunit') ||
      content.includes('phpunit') || /\btest\b/i.test(content);
  });
  const testWorkflow = testResult || {
    exists: false,
    path: null,
    recommendation: 'Add a test workflow (test.yml) with PHPUnit, PHPCS, and asset lint jobs',
  };

  // 3. releaseDrafterWorkflow
  const rdResult = scan((name, content) => {
    return content.includes('release-drafter');
  });
  const releaseDrafterWorkflow = rdResult || {
    exists: false,
    path: null,
    recommendation: 'Add a release-drafter workflow to auto-update draft releases on merge to master',
  };

  // 4. wpDeployWorkflow (WordPress.org SVN)
  const wpResult = scan((name, content) => {
    return content.includes('10up/action-wordpress-plugin-deploy') ||
      (content.includes('WordPress.org') && content.includes('deploy'));
  });
  const wpDeployWorkflow = wpResult || {
    exists: false,
    path: null,
    recommendation: 'Add a WordPress.org SVN deploy workflow (wordpress.yml) triggered on release publish (only for plugins hosted on wordpress.org)',
  };

  // 4b. ec2RsyncDeployStg (Tarosky EC2 rsync staging)
  const ec2StgResult = scan((name, content) => {
    const isStgName = /deploy[-_]?stg|deploy[-_]?staging|staging[-_]?deploy/i.test(name);
    const usesRsyncer = content.includes('Pendect/action-rsyncer') || /action-rsyncer/i.test(content);
    const targetsStaging = /environment:\s*\n?\s*name:\s*staging/i.test(content) ||
      /staging/i.test(content) && /rsync/i.test(content);
    return (isStgName && usesRsyncer) || (usesRsyncer && targetsStaging);
  });
  const ec2RsyncDeployStg = ec2StgResult || {
    exists: false,
    path: null,
    recommendation: 'Add an EC2 rsync staging deploy workflow (deploy-stg.yml) triggered on push to master',
  };

  // 4c. ec2RsyncDeployProd (Tarosky EC2 rsync production)
  const ec2ProdResult = scan((name, content) => {
    const isProdName = /deploy[-_]?prod|deploy[-_]?production|production[-_]?deploy/i.test(name);
    const usesRsyncer = content.includes('Pendect/action-rsyncer') || /action-rsyncer/i.test(content);
    const targetsProd = /environment:\s*\n?\s*name:\s*production/i.test(content);
    return (isProdName && usesRsyncer) || (usesRsyncer && targetsProd);
  });
  const ec2RsyncDeployProd = ec2ProdResult || {
    exists: false,
    path: null,
    recommendation: 'Add an EC2 rsync production deploy workflow (deploy-prod.yml) triggered on release publish',
  };

  // 4d. tagBranchCheck (tarosky/workflows/check-tag-in-branch)
  const tagCheckResult = scan((name, content) => {
    return content.includes('tarosky/workflows/.github/workflows/check-tag-in-branch.yml');
  });
  const tagBranchCheck = tagCheckResult || {
    exists: false,
    path: null,
    recommendation: 'Use tarosky/workflows/check-tag-in-branch.yml to validate that production tags originate from master branch',
  };

  // 5. maintenanceWorkflow
  const maintResult = scan((name, content) => {
    return content.includes('farmhand-wp-action') ||
      content.includes('wp-outdated') ||
      /wp.version.*check/i.test(content) ||
      /check.*wp.version/i.test(content);
  });
  const maintenanceWorkflow = maintResult || {
    exists: false,
    path: null,
    recommendation: 'Add a maintenance workflow to check WP version compatibility periodically',
  };

  // 6. releaseDrafterConfig
  const rdConfigPaths = [
    join(cwd, '.release-drafter.yml'),
    join(cwd, '.github', '.release-drafter.yml'),
  ];
  let releaseDrafterConfig = { exists: false, path: null, recommendation: 'Optionally add .release-drafter.yml for release category customization' };
  for (const p of rdConfigPaths) {
    const s = await statSafe(p);
    if (s && s.isFile()) {
      releaseDrafterConfig = { exists: true, path: p, recommendation: null };
      break;
    }
  }

  // 7. distignore
  const distignorePath = join(cwd, '.distignore');
  const distS = await statSafe(distignorePath);
  const distignore = distS && distS.isFile()
    ? { exists: true, path: distignorePath, recommendation: null }
    : { exists: false, path: null, recommendation: 'Add .distignore for WordPress.org SVN deploy exclusions' };

  // 8. taroskyWorkflows
  const taroskyResult = scan((name, content) => {
    return content.includes('tarosky/workflows');
  });
  const taroskyWorkflows = taroskyResult || {
    exists: false,
    path: null,
    recommendation: 'Consider using tarosky/workflows reusable workflows for standardized WP testing',
  };

  // 9. statusCheck
  const statusResult = scan((name, content) => {
    return content.includes('alls-green') ||
      /status.check/i.test(content) ||
      (content.includes('if: always()') && content.includes('needs:'));
  });
  const statusCheck = statusResult || {
    exists: false,
    path: null,
    recommendation: 'Add a status check job using alls-green for branch protection',
  };

  const output = {
    tool: { name: 'detect_ci', version: '0.1.0' },
    repoRoot: cwd,
    items: {
      workflowsDir: workflowsDirItem,
      testWorkflow,
      releaseDrafterWorkflow,
      wpDeployWorkflow,
      ec2RsyncDeployStg,
      ec2RsyncDeployProd,
      tagBranchCheck,
      maintenanceWorkflow,
      releaseDrafterConfig,
      distignore,
      taroskyWorkflows,
      statusCheck,
    },
    workflows: workflowFiles.map((wf) => ({ name: wf.name, path: wf.path })),
  };

  process.stdout.write(JSON.stringify(output, null, 2));
}

run().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
