const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'conversation-tests.yml'), 'utf8');

test('full-tree security verification cannot skip ledger-only or other tracked-file changes', () => {
  const filters = workflow.split(/\r?\n/).filter(line =>
    line.trimStart().startsWith('paths:') || line.trimStart().startsWith('paths-ignore:'));
  assert.deepEqual(filters, []);
  assert.match(workflow, /^  workflow_dispatch:\s*$/m);
  assert.match(workflow, /^  push:\s*$/m);
  assert.match(workflow, /^  pull_request:\s*$/m);
  assert.match(workflow, /^    branches: \[master, 'codex\/conversations-final-acceptance'\]\s*$/m);
});

test('unconditional actual scan gate and trigger regressions remain wired into CI', () => {
  assert.match(workflow, /^        run: node --test tests\/conversation-codeql-gate\.test\.js tests\/conversation-workflow-trigger\.test\.js\s*$/m);
  assert.match(workflow, /^      - uses: github\/codeql-action\/analyze@v4\s*$/m);
  assert.match(workflow, /^        if: \$\{\{ !cancelled\(\) \}\}\s*$/m);
  assert.match(workflow, /^          CODEQL_REVIEW_MANIFEST: \.github\/codeql-reviewed-findings\.v1\.json\s*$/m);
  assert.match(workflow, /^        run: node scripts\/check-conversation-codeql\.js\s*$/m);
});
