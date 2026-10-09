const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'conversation-tests.yml'), 'utf8');
const diagnosticCondition = "${{ !(github.event_name == 'push' && github.ref == 'refs/heads/codex/conversation-codeql-diagnostics') }}";
const diagnosticRef = 'refs/heads/codex/conversation-codeql-diagnostics';
const jobNames = ['functional', 'dependencies', 'beam', 'static-analysis'];
const headings = [...workflow.matchAll(/^  ([a-z-]+):\r?$/gm)].filter(match => match.index > workflow.indexOf('\njobs:'));
const jobs = new Map(headings.map((match, index) => [match[1],
  workflow.slice(match.index, headings[index + 1]?.index ?? workflow.length)]));

function jobRuns(name, event, ref) {
  const conditions = [...jobs.get(name).matchAll(/^    if: (.+)\r?$/gm)];
  if (!conditions.length) return true;
  assert.equal(conditions.length, 1);
  const condition = conditions[0][1].trim();
  assert.equal(condition, diagnosticCondition);
  return !(event === 'push' && ref === diagnosticRef);
}

test('full-tree security verification cannot skip ledger-only or other tracked-file changes', () => {
  const filters = workflow.split(/\r?\n/).filter(line =>
    line.trimStart().startsWith('paths:') || line.trimStart().startsWith('paths-ignore:'));
  assert.deepEqual(filters, []);
  assert.match(workflow, /^  workflow_dispatch:\s*$/m);
  assert.match(workflow, /^  push:\s*$/m);
  assert.match(workflow, /^  pull_request:\s*$/m);
  assert.match(workflow, /^    branches: \[master, 'codex\/conversations-final-acceptance', 'codex\/conversation-codeql-diagnostics'\]\s*$/m);
  assert.match(workflow, /^on:\r?\n  workflow_dispatch:\r?\n  push:\r?\n    branches: \[master, 'codex\/conversations-final-acceptance', 'codex\/conversation-codeql-diagnostics'\]\r?\n  pull_request:\r?\npermissions:/m);
});

test('only the exact diagnostic branch push skips functional, dependencies and BEAM', () => {
  assert.deepEqual([...jobs.keys()], jobNames);
  for (const name of jobNames.slice(0, 3)) {
    assert.equal([...jobs.get(name).matchAll(/^    if: (.+)\r?$/gm)].length, 1);
    assert.equal(jobRuns(name, 'push', 'refs/heads/codex/conversation-codeql-diagnostics'), false);
  }
  assert.equal(jobRuns('static-analysis', 'push', 'refs/heads/codex/conversation-codeql-diagnostics'), true);
  for (const ref of ['refs/heads/master', 'refs/heads/codex/conversations-final-acceptance',
    'refs/heads/codex/conversation-codeql-diagnostics-extra', 'refs/tags/codex/conversation-codeql-diagnostics']) {
    for (const name of jobNames) assert.equal(jobRuns(name, 'push', ref), true, `${name}: ${ref}`);
  }
});

test('pull requests and manual dispatch run all four jobs regardless of branch', () => {
  for (const event of ['pull_request', 'workflow_dispatch']) {
    for (const ref of ['refs/heads/master', 'refs/heads/codex/conversations-final-acceptance',
      'refs/heads/codex/conversation-codeql-diagnostics', 'refs/heads/other-branch', 'refs/pull/1/merge']) {
      for (const name of jobNames) assert.equal(jobRuns(name, event, ref), true, `${event}: ${ref}: ${name}`);
    }
  }
});

test('unconditional actual scan gate and trigger regressions remain wired into CI', () => {
  const security = jobs.get('static-analysis');
  assert.match(security, /^    env:\r?\n(?:      #[^\r\n]*\r?\n)*      CODEQL_ACTION_DIFF_INFORMED_QUERIES: 'false'\s*$/m);
  assert.match(jobs.get('functional'), /^        run: npm run test:conversation-soak\s*$/m);
  assert.doesNotMatch(security, /^    (?:if|needs):/m);
  for (const body of jobs.values()) assert.doesNotMatch(body, /^    needs:/m);
  assert.match(workflow, /^permissions:\r?\n  contents: read\r?\nconcurrency:/m);
  assert.match(security, /^    permissions:\r?\n      contents: read\r?\n      security-events: write\r?\n    steps:/m);
  assert.deepEqual(security.match(/^        if: .+$/gm)?.map(line => line.trim()), ['if: ${{ !cancelled() }}']);
  assert.match(security, /^      - name: Gate actual CodeQL security findings\r?\n        if: \$\{\{ !cancelled\(\) \}\}\r?\n        env:/m);
  assert.match(security, /^      - uses: github\/codeql-action\/init@v4\s*$/m);
  assert.match(workflow, /^        run: node --test tests\/conversation-codeql-gate\.test\.js tests\/conversation-workflow-trigger\.test\.js\s*$/m);
  assert.match(workflow, /^      - uses: github\/codeql-action\/analyze@v4\s*$/m);
  assert.match(workflow, /^        if: \$\{\{ !cancelled\(\) \}\}\s*$/m);
  assert.match(workflow, /^          CODEQL_REVIEW_MANIFEST: \.github\/codeql-reviewed-findings\.v1\.json\s*$/m);
  assert.match(workflow, /^        run: node scripts\/check-conversation-codeql\.js\s*$/m);
});
