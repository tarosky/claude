import { stat, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const cwd = process.cwd();

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

  // 4. wpDeployWorkflow
  const wpResult = scan((name, content) => {
    return content.includes('10up/action-wordpress-plugin-deploy') ||
      (content.includes('WordPress.org') && content.includes('deploy'));
  });
  const wpDeployWorkflow = wpResult || {
    exists: false,
    path: null,
    recommendation: 'Add a WordPress.org deploy workflow triggered on release publish',
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
