const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const { auditDirectory, inspectReport, LIMITS, REVIEW_LIMITS, sourceFingerprint, sourceTreeFingerprint } = require('../scripts/check-conversation-codeql');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/check-conversation-codeql.js');
const securityRule = () => ({ id: 'js/sql-injection', defaultConfiguration: { level: 'warning' },
  properties: { tags: ['security', 'external/cwe/cwe-089'], 'security-severity': '8.8' } });
const qualityRule = () => ({ id: 'js/unused-variable', properties: { tags: ['maintainability'] } });
const location = (uri = 'backend/synthetic-gate.js', line = 12) => ({ physicalLocation: {
  artifactLocation: { uri, uriBaseId: '%SRCROOT%' }, region: { startLine: line } } });
const finding = (overrides = {}) => ({ ruleId: 'js/sql-injection', ruleIndex: 0,
  message: { text: 'Synthetic security result' }, locations: [location()], ...overrides });
const run = (results = []) => ({ tool: { driver: { name: 'CodeQL', version: '2.24.0',
  rules: [securityRule(), qualityRule()] } }, invocations: [{ executionSuccessful: true }], results });
const report = (...runs) => ({ version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
  runs: runs.length ? runs : [run()] });

function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winga-codeql-synthetic-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeReport(dir, value, name = 'javascript.sarif') {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
}

function audit(t, value, outcome = 'success') {
  const dir = directory(t);
  writeReport(dir, value);
  return auditDirectory(dir, outcome);
}

function cli(dir, outcome, args = [dir], reviewManifestPath, gateScript = script) {
  if (arguments.length < 2) outcome = 'success';
  const env = { ...process.env, CODEQL_ANALYSIS_OUTCOME: outcome, CODEQL_SARIF_DIRECTORY: dir };
  if (outcome === undefined) delete env.CODEQL_ANALYSIS_OUTCOME;
  delete env.NODE_OPTIONS;
  delete env.CODEQL_REVIEW_MANIFEST;
  if (reviewManifestPath !== undefined) env.CODEQL_REVIEW_MANIFEST = reviewManifestPath;
  return spawnSync(process.execPath, [gateScript, ...args], { env, encoding: 'utf8',
    windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
}

function failed(result, errorCode) {
  assert.equal(result.ok, false);
  if (errorCode) assert.equal(result.errorCode, errorCode);
}

test('explicit empty results from a successfully executed security scan pass', t => {
  const value = audit(t, report());
  assert.deepEqual(value, { ok: true, totals: { reports: 1, runs: 1, results: 0, securityFindings: 0,
    levels: { none: 0, note: 0, warning: 0, error: 0 } }, findings: [] });
});

test('documented CodeQL CLI driver name supports complete empty and security-result reports', t => {
  // https://docs.github.com/en/code-security/reference/code-scanning/codeql/codeql-cli/sarif-output
  for (const results of [[], [finding({ level: 'warning' })]]) {
    const current = run(results);
    current.tool.driver.name = 'CodeQL command-line toolchain';
    current.tool.driver.organization = 'GitHub';
    const value = audit(t, report(current));
    assert.equal(value.ok, results.length === 0);
    if (results.length) failed(value, 'CODEQL_SECURITY_FINDINGS');
  }
  for (const name of ['Other tool', 'CodeQL command-line toolchain ', 'CodeQL-private-marker']) {
    const current = run();
    current.tool.driver.name = name;
    const value = audit(t, report(current));
    failed(value, 'CODEQL_SARIF_INVALID');
    assert.deepEqual(value.diagnostic, { stage: 'tool-metadata', field: 'tool.driver.name', report: 0, run: 0 });
    assert.equal(JSON.stringify(value).includes(name), false);
  }
});

test('CLI driver name with grouped extension rules never bypasses security or completeness checks', t => {
  const current = run([finding({ rule: { id: 'js/sql-injection', index: 0, toolComponent: { index: 0 } } })]);
  current.tool.driver.name = 'CodeQL command-line toolchain';
  current.tool.driver.rules = [];
  current.tool.extensions = [{ name: 'codeql/javascript-queries', rules: [securityRule()] }];
  failed(audit(t, report(current)), 'CODEQL_SECURITY_FINDINGS');
  current.results = [];
  assert.equal(audit(t, report(current)).ok, true);
  delete current.results;
  failed(audit(t, report(current)), 'CODEQL_SARIF_INVALID');
  current.results = [];
  delete current.invocations;
  failed(audit(t, report(current)), 'CODEQL_EXECUTION_UNVERIFIED');
  current.invocations = [{ executionSuccessful: false }];
  failed(audit(t, report(current)), 'CODEQL_EXECUTION_UNSUCCESSFUL');
  current.invocations = [{ executionSuccessful: true, toolExecutionNotifications: [
    { level: 'warning', message: { text: 'Synthetic diagnostic' } }
  ] }];
  failed(audit(t, report(current)), 'CODEQL_EXECUTION_DIAGNOSTIC');
  current.invocations = [{ executionSuccessful: true }];
  current.properties = { resultsTruncated: true };
  failed(audit(t, report(current)), 'CODEQL_SARIF_INCOMPLETE');
});

test('validation diagnostics identify fixed stages, fields and exact numeric positions', t => {
  const cases = [
    [v => { v.version = 'invalid'; }, { stage: 'report-schema', field: 'version', report: 0 }],
    [v => { delete v.runs[0].results; }, { stage: 'run-schema', field: 'results', report: 0, run: 0 }],
    [v => { v.runs[0].tool.extensions = {}; }, { stage: 'tool-metadata', field: 'tool.extensions', report: 0, run: 0 }],
    [v => { v.runs[0].tool.driver.rules[0].properties['security-severity'] = 'private'; },
      { stage: 'rule-metadata', field: 'security-severity', report: 0, run: 0, component: 0, rule: 0 }],
    [v => { v.runs[0].results[0].ruleIndex = 99; },
      { stage: 'rule-reference', field: 'rule.resolution', report: 0, run: 0, result: 0 }],
    [v => { v.runs[0].results[0].message = {}; },
      { stage: 'result-schema', field: 'message', report: 0, run: 0, result: 0,
        messageShape: { messageType: 'object', textType: 'undefined', textEmpty: false,
          idType: 'undefined', markdownType: 'undefined' } }],
    [v => { v.runs[0].results[0].locations[0].physicalLocation.region.startLine = 0; },
      { stage: 'location', field: 'startLine', report: 0, run: 0, result: 0, location: 0 }],
    [v => { v.runs[0].invocations[0].exitCode = 1; },
      { stage: 'execution', field: 'exit-code', report: 0, run: 0, invocation: 0 }],
    [v => { v.runs[0].invocations[0].toolExecutionNotifications = [{ level: 'error', message: { text: 'private' } }]; },
      { stage: 'execution', field: 'notification.level', report: 0, run: 0, invocation: 0, notification: 0 }]
  ];
  for (const [mutate, diagnostic] of cases) {
    const current = report(run([finding()]));
    mutate(current);
    const value = audit(t, current);
    failed(value);
    assert.deepEqual(value.diagnostic, diagnostic);
    assert.equal(Object.hasOwn(value, 'totals'), false);
  }
  const dir = directory(t);
  writeReport(dir, report(), 'a.sarif');
  const current = report(run(), run([finding(), finding({ ruleIndex: 99 })]));
  writeReport(dir, current, 'z.sarif');
  assert.deepEqual(auditDirectory(dir, 'success').diagnostic,
    { stage: 'rule-reference', field: 'rule.resolution', report: 1, run: 1, result: 1 });
});

test('CLI failure diagnostics are bounded and never reveal input keys, paths, values or parser messages', t => {
  const dir = directory(t);
  const privateMarker = 'SYNTHETIC_SECRET_DO_NOT_LOG';
  const cases = [
    [v => { v.runs[0].tool.driver.name = privateMarker; }, 'tool-metadata', 'tool.driver.name'],
    [v => { v.runs[0].tool.driver.rules[0].properties['security-severity'] = privateMarker; }, 'rule-metadata', 'security-severity'],
    [v => { v.runs[0].results[0].rule = { toolComponent: { name: privateMarker } }; }, 'rule-reference', 'tool-component.resolution'],
    [v => { v.runs[0].results[0].message = { text: null, privateMarker }; }, 'result-schema', 'message'],
    [v => { v.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri = null;
      v.runs[0].results[0].locations[0].physicalLocation.region.snippet = { text: privateMarker }; }, 'location', 'artifact.uri'],
    [v => { v.runs[0].properties = { ['resultsTruncated-' + privateMarker]: true }; }, 'completeness', 'truncation-marker'],
    [v => { v.runs[0].invocations[0].toolConfigurationNotifications = [
      { level: 'error', message: { text: privateMarker } }]; }, 'execution', 'notification.level']
  ];
  for (const [mutate, stage, field] of cases) {
    const current = report(run([finding()]));
    mutate(current);
    writeReport(dir, current);
    const value = cli(dir);
    assert.equal(value.status, 1);
    assert.equal(value.stderr, '');
    assert.equal(value.stdout.includes(privateMarker), false);
    assert.equal(value.stdout.includes(dir), false);
    assert.ok(value.stdout.length < 1000);
    const summary = JSON.parse(value.stdout.trim());
    assert.equal(summary.diagnostic.stage, stage);
    assert.equal(summary.diagnostic.field, field);
    assert.equal(Object.hasOwn(summary, 'totals'), false);
  }
  fs.writeFileSync(path.join(dir, 'javascript.sarif'), '{' + privateMarker);
  const malformed = cli(dir);
  assert.equal(malformed.status, 1);
  assert.equal(malformed.stdout.includes(privateMarker), false);
  assert.deepEqual(JSON.parse(malformed.stdout).diagnostic,
    { stage: 'report-parse', field: 'json-utf8', report: 0 });
  fs.writeFileSync(path.join(dir, 'javascript.sarif'), Buffer.from([0xff]));
  assert.deepEqual(auditDirectory(dir, 'success').diagnostic,
    { stage: 'report-parse', field: 'json-utf8', report: 0 });
});

test('all security levels, including warning, note, none and the default level, block', t => {
  for (const level of ['error', 'warning', 'note', 'none', undefined]) {
    const value = audit(t, report(run([finding(level === undefined ? {} : { level })])));
    failed(value, 'CODEQL_SECURITY_FINDINGS');
    assert.equal(value.totals.securityFindings, 1);
    assert.equal(value.findings[0].level, level ?? 'warning');
  }
});

test('tags alone and every positive numeric security severity identify security findings', t => {
  for (const properties of [{ tags: ['security'] }, { tags: ['Security'], 'security-severity': '0' },
    { 'security-severity': '0.1' }, { 'security-severity': '3.9' }, { 'security-severity': '10' }]) {
    const current = run([finding({ level: 'warning' })]);
    current.tool.driver.rules[0].properties = properties;
    failed(audit(t, report(current)), 'CODEQL_SECURITY_FINDINGS');
  }
});

test('explicitly classified non-security results are counted but do not trip the security gate', t => {
  const value = audit(t, report(run([finding({ ruleId: 'js/unused-variable', ruleIndex: 1, level: 'error' })])));
  assert.equal(value.ok, true);
  assert.equal(value.totals.results, 1);
  assert.equal(value.totals.securityFindings, 0);
  assert.deepEqual(value.findings, []);
});

test('baseline, suppression and result kind cannot hide an emitted security result', t => {
  for (const baselineState of ['new', 'unchanged', 'updated', 'absent']) {
    for (const kind of ['fail', 'pass', 'notApplicable', 'review', 'open', 'informational']) {
      failed(audit(t, report(run([finding({ baselineState, kind, level: 'none',
        suppressions: [{ kind: 'external', status: 'accepted', justification: 'Synthetic only' }] })]))),
      'CODEQL_SECURITY_FINDINGS');
    }
  }
});

test('real v4 grouped-pack rule references are resolved by extension index, name and guid', t => {
  for (const target of [{ index: 0 }, { name: 'codeql/javascript-queries' }, { guid: 'synthetic-pack-guid' },
    { index: 0, name: 'codeql/javascript-queries', guid: 'synthetic-pack-guid' }]) {
    const current = run([finding({ ruleIndex: undefined,
      rule: { id: 'js/sql-injection', index: 0, toolComponent: target } })]);
    delete current.results[0].ruleIndex;
    current.tool.driver.rules = [];
    current.tool.extensions = [{ name: 'codeql/javascript-queries', guid: 'synthetic-pack-guid',
      rules: [securityRule()] }];
    const value = audit(t, report(current));
    failed(value, 'CODEQL_SECURITY_FINDINGS');
    assert.equal(value.findings[0].ruleId, 'js/sql-injection');
  }
});

test('driver rules can be referenced by id alone, index alone or reporting descriptor reference', t => {
  for (const reference of [{ ruleId: 'js/sql-injection' }, { ruleIndex: 0 },
    { rule: { id: 'js/sql-injection' } }, { rule: { index: 0 } }]) {
    const current = finding();
    delete current.ruleId;
    delete current.ruleIndex;
    failed(audit(t, report(run([{ ...current, ...reference }]))), 'CODEQL_SECURITY_FINDINGS');
  }
});

test('all reports and runs are audited, not just the first successful empty run', t => {
  const dir = directory(t);
  writeReport(dir, report(), 'a.sarif');
  writeReport(dir, report(run(), run([finding(), finding({ level: 'note' })])), 'z.sarif');
  fs.writeFileSync(path.join(dir, 'ignored.txt'), 'Not a report');
  const value = auditDirectory(dir, 'success');
  failed(value, 'CODEQL_SECURITY_FINDINGS');
  assert.deepEqual(value.totals, { reports: 2, runs: 3, results: 2, securityFindings: 2,
    levels: { none: 0, note: 1, warning: 1, error: 0 } });
  assert.deepEqual(value.findings.map(item => [item.report, item.run, item.result]), [[1, 1, 0], [1, 1, 1]]);
  writeReport(dir, { runs: [] }, 'broken.sarif');
  const unavailable = auditDirectory(dir, 'success');
  failed(unavailable);
  assert.equal(Object.hasOwn(unavailable, 'totals'), false);
});

test('missing, empty, nested-only, zero-byte, unreadable-type and corrupt reports fail closed', t => {
  const dir = directory(t);
  for (const input of [undefined, '', path.join(dir, 'missing'), dir]) failed(auditDirectory(input, 'success'));
  fs.mkdirSync(path.join(dir, 'nested'));
  writeReport(path.join(dir, 'nested'), report());
  failed(auditDirectory(dir, 'success'), 'CODEQL_REPORTS_MISSING');
  const filename = path.join(dir, 'javascript.sarif');
  fs.mkdirSync(filename);
  failed(auditDirectory(dir, 'success'));
  fs.rmdirSync(filename);
  for (const content of ['', 'null', '{}', '[]', '{"version":"2.1.0","runs":[',
    JSON.stringify(report()).slice(0, -1), JSON.stringify(report()) + '\nprivate-unparsed-tail']) {
    fs.writeFileSync(filename, content);
    failed(auditDirectory(dir, 'success'));
  }
  fs.writeFileSync(filename, Buffer.from([0xff, 0xfe]));
  failed(auditDirectory(dir, 'success'));
});

test('wrong schema, absent results, absent rules and diagnostic-only reports are not empty-green', t => {
  for (const mutate of [value => { value.version = '2.0.0'; }, value => { value.runs = []; },
    value => { value.runs = null; }, value => { value.runs[0] = null; },
    value => { delete value.runs[0].results; }, value => { value.runs[0].results = null; },
    value => { value.runs[0].results = {}; }, value => { value.runs[0].tool.driver.name = 'Other tool'; },
    value => { delete value.runs[0].tool; }, value => { value.runs[0].tool.driver.rules = []; },
    value => { value.runs[0].tool.driver.rules = [qualityRule()]; },
    value => { value.runs[0].tool.extensions = null; }, value => { value.runs[0].tool.driver.rules = null; },
    value => { value.runs[0].tool.driver.rules.push(securityRule()); }]) {
    const current = report();
    mutate(current);
    failed(audit(t, current));
  }
});

test('unsuccessful, skipped, cancelled and missing action outcomes cannot certify a clean scan', t => {
  const dir = directory(t);
  writeReport(dir, report());
  for (const outcome of [undefined, '', 'failure', 'skipped', 'cancelled', 'Success', 'true']) {
    failed(auditDirectory(dir, outcome), 'CODEQL_ANALYSIS_UNSUCCESSFUL');
    const result = cli(dir, outcome);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout.trim()).ok, false);
  }
  writeReport(dir, report(run([finding()])));
  const value = auditDirectory(dir, 'failure');
  failed(value, 'CODEQL_ANALYSIS_UNSUCCESSFUL');
  assert.equal(value.findings.length, 1);
});

test('missing or unsuccessful tool invocations and conflicting exit metadata fail closed', t => {
  for (const invocations of [undefined, [], null, {}, [null], [{}], [{ executionSuccessful: false }],
    [{ executionSuccessful: 'true' }], [{ executionSuccessful: true, exitCode: 1 }],
    [{ executionSuccessful: true, exitCode: '0' }],
    [{ executionSuccessful: true, exitSignalName: 'SIGTERM' }],
    [{ executionSuccessful: true, exitSignalNumber: 15 }],
    [{ executionSuccessful: true, processStartFailureMessage: 'Synthetic private failure' }],
    [{ executionSuccessful: true }, { executionSuccessful: false }]]) {
    const current = run();
    if (invocations === undefined) delete current.invocations;
    else current.invocations = invocations;
    failed(audit(t, report(current)));
  }
  const current = run();
  current.invocations[0].exitCode = 0;
  assert.equal(audit(t, report(current)).ok, true);
});

test('execution and configuration warning/error diagnostics fail; benign notes are accepted', t => {
  for (const key of ['toolExecutionNotifications', 'toolConfigurationNotifications']) {
    for (const level of ['warning', 'error', undefined]) {
      const current = run();
      current.invocations[0][key] = [{ message: { text: 'Synthetic diagnostic' }, ...(level ? { level } : {}) }];
      failed(audit(t, report(current)), 'CODEQL_EXECUTION_DIAGNOSTIC');
    }
    const current = run();
    current.invocations[0][key] = [{ level: 'note', descriptor: { id: 'js/summary' },
      message: { text: 'Synthetic analysis summary' } }];
    assert.equal(audit(t, report(current)).ok, true);
    current.invocations[0][key] = {};
    failed(audit(t, report(current)));
  }
});

test('schema-compatible empty notification text passes only for successful note or trace execution', t => {
  // OASIS sarif-schema-2.1.0.json defines message.text as string, without minLength.
  for (const key of ['toolExecutionNotifications', 'toolConfigurationNotifications']) {
    for (const message of [{ text: '' }, { text: '', markdown: '' },
      { text: '', id: 'synthetic-summary' }, { id: 'synthetic-summary' }]) {
      for (const level of ['note', 'none', 'warning', 'error', undefined]) {
        const current = run();
        current.tool.driver.name = 'CodeQL command-line toolchain';
        current.invocations[0][key] = [{ message, descriptor: { id: 'synthetic-summary' },
          ...(level === undefined ? {} : { level }) }];
        const value = audit(t, report(current));
        if (level === 'note' || level === 'none') assert.equal(value.ok, true);
        else failed(value, 'CODEQL_EXECUTION_DIAGNOSTIC');
      }
    }
  }
  const current = run();
  current.invocations[0] = { executionSuccessful: false,
    toolExecutionNotifications: [{ level: 'note', message: { text: '' } }] };
  failed(audit(t, report(current)), 'CODEQL_EXECUTION_UNSUCCESSFUL');
  current.invocations[0].executionSuccessful = true;
  current.invocations[0].exitCode = 1;
  failed(audit(t, report(current)), 'CODEQL_EXECUTION_UNSUCCESSFUL');
});

test('empty notification text never hides diagnostic failure markers in metadata or arguments', t => {
  for (const notification of [
    { message: { text: '' }, descriptor: { id: 'js/query-timeout' } },
    { message: { text: '', markdown: 'Results truncated' } },
    { message: { text: '', id: 'query-skipped' } },
    { message: { id: 'synthetic-summary', arguments: ['Incomplete analysis'] } },
    { message: { text: '', arguments: ['Query failed'] } }
  ]) {
    const current = run();
    current.invocations[0].toolExecutionNotifications = [{ level: 'note', ...notification }];
    failed(audit(t, report(current)), 'CODEQL_SARIF_INCOMPLETE');
  }
});

test('empty security-result messages cannot hide warning, note, none or suppressed findings', t => {
  for (const message of [{ text: '' }, { text: '', markdown: '' }, { id: 'synthetic-result' }]) {
    for (const level of ['warning', 'error', 'note', 'none']) {
      const current = run([finding({ message, level, baselineState: 'unchanged',
        suppressions: [{ kind: 'external', status: 'accepted' }] })]);
      current.invocations[0].toolExecutionNotifications = [{ level: 'note', message: { text: '' } }];
      const value = audit(t, report(current));
      failed(value, 'CODEQL_SECURITY_FINDINGS');
      assert.equal(value.totals.securityFindings, 1);
      assert.equal(value.findings[0].level, level);
    }
  }
});

test('malformed notification messages fail with bounded safe shape metadata', t => {
  const dir = directory(t);
  const privateMarker = 'SYNTHETIC_PRIVATE_NOTIFICATION_MUST_NOT_APPEAR';
  for (const message of [undefined, null, '', privateMarker, [], {}, { text: null }, { text: 0 },
    { markdown: '' }, { id: '' }, { text: '', markdown: null }, { text: '', id: 1 },
    { text: '', arguments: [null] }, { text: '', arguments: privateMarker }]) {
    const current = run();
    current.invocations[0].toolExecutionNotifications = [{ level: 'note', message,
      properties: { [privateMarker]: privateMarker } }];
    writeReport(dir, report(current));
    const value = auditDirectory(dir, 'success');
    failed(value, 'CODEQL_SARIF_INVALID');
    assert.equal(value.diagnostic.stage, 'execution');
    assert.equal(value.diagnostic.field, 'message');
    assert.deepEqual([value.diagnostic.report, value.diagnostic.run, value.diagnostic.invocation,
      value.diagnostic.notification], [0, 0, 0, 0]);
    assert.deepEqual(Object.keys(value.diagnostic.messageShape),
      ['messageType', 'textType', 'textEmpty', 'idType', 'markdownType']);
    const output = cli(dir);
    assert.equal(output.status, 1);
    assert.equal(output.stderr, '');
    assert.equal(output.stdout.includes(privateMarker), false);
    assert.equal(output.stdout.includes(dir), false);
    assert.ok(output.stdout.length < 1000);
    assert.equal(Object.hasOwn(JSON.parse(output.stdout), 'totals'), false);
  }
});

test('even note diagnostics signalling truncation or incomplete execution fail closed', t => {
  for (const marker of ['Results truncated', 'Partial results', 'Incomplete analysis', 'Query timed out',
    'Evaluation timeout', 'Execution aborted', 'Query failed', 'Scan cancelled', 'Query skipped']) {
    const current = run();
    current.invocations[0].toolExecutionNotifications = [{ level: 'note', message: { text: marker } }];
    failed(audit(t, report(current)), 'CODEQL_SARIF_INCOMPLETE');
  }
  const current = run();
  current.invocations[0].toolExecutionNotifications = [{ level: 'none',
    descriptor: { id: 'js/query-timeout' }, message: { text: 'Synthetic details' } }];
  failed(audit(t, report(current)), 'CODEQL_SARIF_INCOMPLETE');
});

test('truncation flags, externalized results and incremental-only reports cannot pass', t => {
  for (const mutate of [value => { value.truncated = true; },
    value => { value.runs[0].properties = { resultsTruncated: true }; },
    value => { value.runs[0].properties = { incomplete: 'true' }; },
    value => { value.runs[0].invocations[0].properties = { resultsOmitted: 1 }; },
    value => { value.runs[0].externalPropertyFileReferences = { results: [{ itemCount: 1 }] }; },
    value => { value.inlineExternalProperties = [{ results: [] }]; },
    value => { value.runs[0].properties = { incrementalMode: 'diff-informed' }; },
    value => { value.runs[0].properties = { incrementalMode: 'overlay' }; }]) {
    const current = report();
    mutate(current);
    failed(audit(t, current), 'CODEQL_SARIF_INCOMPLETE');
  }
  const current = report();
  current.runs[0].properties = { truncated: false, resultsOmitted: 0 };
  assert.equal(audit(t, current).ok, true);
});

test('unresolved, inconsistent and ambiguous rule references cannot hide a result', t => {
  for (const overrides of [{ ruleId: 'js/unknown' }, { ruleIndex: 1 }, { ruleIndex: -1 },
    { ruleIndex: 99 }, { ruleIndex: '0' }, { rule: null }, { ruleId: '' },
    { rule: { id: 'js/unused-variable' } }, { rule: { index: 1 } },
    { rule: { index: 0, toolComponent: { index: 0 } } },
    { rule: { index: 0, toolComponent: { index: -1 } } },
    { rule: { index: 0, toolComponent: {} } },
    { rule: { index: 0, toolComponent: { name: 'unknown' } } },
    { rule: { index: 0, toolComponent: { name: 'CodeQL', guid: 'wrong' } } }]) {
    failed(audit(t, report(run([finding(overrides)]))));
  }
  const current = run([finding({ ruleIndex: 1, ruleId: 'js/unclassified' })]);
  current.tool.driver.rules[1] = { id: 'js/unclassified' };
  failed(audit(t, report(current)));
  const missing = finding();
  delete missing.ruleId;
  delete missing.ruleIndex;
  failed(audit(t, report(run([missing]))));
});

test('malformed rule metadata and result structures fail closed', t => {
  for (const mutate of [current => { current.tool.driver.rules[0].id = ''; },
    current => { current.tool.driver.rules[0].properties = null; },
    current => { current.tool.driver.rules[0].properties.tags = 'security'; },
    current => { current.tool.driver.rules[0].properties.tags = [1]; },
    current => { current.tool.driver.rules[0].defaultConfiguration = null; },
    current => { current.tool.driver.rules[0].defaultConfiguration.level = 'invalid'; },
    current => { current.results[0] = null; }, current => { current.results[0].message = {}; },
    current => { current.results[0].level = null; }, current => { current.results[0].level = 'low'; },
    current => { current.results[0].kind = 'unknown'; }, current => { current.results[0].locations = null; },
    current => { current.results[0].locations = [null]; },
    current => { current.results[0].locations[0].physicalLocation.region.startLine = 0; },
    current => { current.results[0].locations[0].physicalLocation.artifactLocation = {}; }]) {
    const current = run([finding()]);
    mutate(current);
    failed(audit(t, report(current)));
  }
  for (const severity of ['', 'NaN', '-1', '11', '8.8private', 8.8, null]) {
    const current = run();
    current.tool.driver.rules[0].properties['security-severity'] = severity;
    failed(audit(t, report(current)));
  }
});

test('location-less findings still block and indexed artifacts produce safe triage locations', t => {
  const noLocation = audit(t, report(run([finding({ locations: [] })])));
  failed(noLocation, 'CODEQL_SECURITY_FINDINGS');
  assert.deepEqual(noLocation.findings[0].locations, []);
  const current = run([finding()]);
  current.artifacts = [{ location: { uri: 'src/chat/synthetic.js' } }];
  current.results[0].locations[0].physicalLocation.artifactLocation = { index: 0 };
  const value = audit(t, report(current));
  assert.deepEqual(value.findings[0].locations, [{ path: 'src/chat/synthetic.js', line: 12 }]);
  current.results[0].locations[0].physicalLocation.artifactLocation.index = 99;
  failed(audit(t, report(current)));
});

test('unsafe metadata is omitted without exempting the security finding', t => {
  for (const uri of ['https://synthetic.invalid/file?token=synthetic-private-marker',
    'file:///private/synthetic-private-marker.js', '../synthetic-private-marker.js',
    '/private/synthetic-private-marker.js', 'C:\\private\\synthetic-private-marker.js',
    'src/private.js?token=synthetic-private-marker', 'src/private.js#synthetic-private-marker',
    'src/%0asynthetic-private-marker.js', 'src/private\n::error::synthetic-private-marker',
    'src/' + 'x'.repeat(513)]) {
    const value = audit(t, report(run([finding({ locations: [location(uri)] })])));
    failed(value, 'CODEQL_SECURITY_FINDINGS');
    assert.deepEqual(value.findings[0].locations, []);
    assert.equal(JSON.stringify(value).includes('synthetic-private-marker'), false);
  }
});

test('byte, report count, run count, result count and nesting bounds fail rather than truncate', t => {
  const dir = directory(t);
  const filename = path.join(dir, 'large.sarif');
  const fd = fs.openSync(filename, 'w');
  fs.ftruncateSync(fd, LIMITS.fileBytes + 1);
  fs.closeSync(fd);
  failed(auditDirectory(dir, 'success'), 'CODEQL_SARIF_LIMIT');
  fs.unlinkSync(filename);
  for (let i = 0; i < 5; i++) {
    const fd = fs.openSync(path.join(dir, `aggregate-${i}.sarif`), 'w');
    fs.ftruncateSync(fd, LIMITS.fileBytes);
    fs.closeSync(fd);
  }
  failed(auditDirectory(dir, 'success'), 'CODEQL_SARIF_LIMIT');
  for (let i = 0; i < 5; i++) fs.unlinkSync(path.join(dir, `aggregate-${i}.sarif`));
  for (let i = 0; i <= LIMITS.files; i++) writeReport(dir, report(), `${i}.sarif`);
  failed(auditDirectory(dir, 'success'), 'CODEQL_SARIF_LIMIT');
  failed(audit(t, report(...Array.from({ length: LIMITS.runs + 1 }, () => run()))));
  const tooMany = report(run(Array(LIMITS.results + 1).fill(finding())));
  assert.throws(() => inspectReport(tooMany, 0), error => error.errorCode === 'CODEQL_SARIF_LIMIT');
  const nested = report();
  let properties = nested;
  for (let i = 0; i <= LIMITS.depth; i++) { properties.properties = {}; properties = properties.properties; }
  failed(audit(t, nested), 'CODEQL_SARIF_LIMIT');
});

test('symlinked report files are not trusted as generated reports', t => {
  const dir = directory(t);
  const source = path.join(dir, 'synthetic-report.json');
  fs.writeFileSync(source, JSON.stringify(report()));
  try { fs.symlinkSync(source, path.join(dir, 'linked.sarif'), 'file'); }
  catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Windows file symlinks require a privilege; CI runs this on Linux');
      return;
    }
    throw error;
  }
  failed(auditDirectory(dir, 'success'));
});

test('symlinked report directories, including Windows junctions, fail closed', t => {
  const dir = directory(t);
  const sourceDirectory = path.join(dir, 'source');
  fs.mkdirSync(sourceDirectory);
  writeReport(sourceDirectory, report());
  const linkedDirectory = path.join(dir, 'linked-directory');
  fs.symlinkSync(sourceDirectory, linkedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
  failed(auditDirectory(linkedDirectory, 'success'));
});

test('unsafe rule IDs cannot inject logging commands or leak URL credentials', t => {
  for (const id of ['js/sql-injection\n::error::synthetic-private-marker',
    'https://synthetic.invalid/?token=synthetic-private-marker', 'js/' + 'x'.repeat(161)]) {
    const current = run([finding({ ruleId: id })]);
    current.tool.driver.rules[0].id = id;
    const value = audit(t, report(current));
    failed(value, 'CODEQL_SECURITY_FINDINGS');
    assert.equal(value.findings[0].ruleId, null);
    assert.equal(JSON.stringify(value).includes('synthetic-private-marker'), false);
  }
});

test('CLI emits aggregate summary and complete safe metadata, never source or sensitive fields', t => {
  const dir = directory(t);
  const privateMarker = 'SYNTHETIC_PRIVATE_DATA_MUST_NOT_BE_LOGGED';
  const current = run([finding({ message: { text: privateMarker },
    relatedLocations: [{ message: { text: privateMarker } }],
    codeFlows: [{ message: { text: privateMarker } }],
    partialFingerprints: { primaryLocationLineHash: privateMarker }, properties: { private: privateMarker } })]);
  current.invocations[0].environmentVariables = { PRIVATE_SYNTHETIC: privateMarker };
  current.invocations[0].commandLine = privateMarker;
  current.results[0].locations[0].physicalLocation.region.snippet = { text: privateMarker };
  current.artifacts = [{ contents: { text: privateMarker } }];
  writeReport(dir, report(current));
  const result = cli(dir);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.includes(privateMarker), false);
  const [summary, detail] = result.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(summary.privacy, 'aggregate-only');
  assert.equal(summary.errorCode, 'CODEQL_SECURITY_FINDINGS');
  assert.equal(Object.hasOwn(summary, 'findings'), false);
  assert.deepEqual(detail, { mode: 'codeql-finding-location', report: 0, run: 0, result: 0,
    ruleId: 'js/sql-injection', level: 'warning', securitySeverity: 8.8,
    locations: [{ path: 'backend/synthetic-gate.js', line: 12 }],
    resultFingerprint: inspectReport(report(current), 0).findings[0].resultFingerprint });
  writeReport(dir, report());
  assert.equal(cli(dir, 'success', []).status, 0);
  fs.writeFileSync(path.join(dir, 'javascript.sarif'), '{' + privateMarker);
  const malformed = cli(dir);
  assert.equal(malformed.status, 1);
  assert.equal(malformed.stderr, '');
  assert.equal(malformed.stdout.includes(privateMarker), false);
  assert.equal(Object.hasOwn(JSON.parse(malformed.stdout), 'totals'), false);
  assert.equal(cli(dir, 'success', [dir, '--ignore-warning']).status, 1);
});

test('workflow wires Node 24 and the actual analyze output into an unconditional failure-path gate', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/conversation-tests.yml'), 'utf8');
  const job = workflow.slice(workflow.indexOf('  static-analysis:'));
  assert.match(job, /node-version: '24'/);
  assert.match(job, /run: node --test tests\/conversation-codeql-gate\.test\.js/);
  assert.match(job, /github\/codeql-action\/analyze@v4\s+id: codeql-analysis/);
  assert.match(job, /output: \$\{\{ runner.temp \}\}\/conversation-codeql-sarif/);
  assert.match(job, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(job, /CODEQL_ANALYSIS_OUTCOME: \$\{\{ steps.codeql-analysis.outcome \}\}/);
  assert.match(job, /CODEQL_SARIF_DIRECTORY: \$\{\{ runner.temp \}\}\/conversation-codeql-sarif/);
  assert.match(job, /CODEQL_REVIEW_MANIFEST: \.github\/codeql-reviewed-findings\.v1\.json/);
  assert.match(job, /run: node scripts\/check-conversation-codeql\.js/);
  assert.match(job, /queries: security-extended/);
  assert.doesNotMatch(job, /continue-on-error|upload-artifact|secrets\.|actions: write|contents: write|upload: never/);
});

function fixtureGit(root, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.fsmonitor=false', '-C', root, ...args],
    { env, windowsHide: true, stdio: 'ignore', timeout: 15000 });
}

const fingerprintOf = result => inspectReport(report(run([result])), 0).findings[0].resultFingerprint;

function reviewFixture(t) {
  const sourceRoot = directory(t);
  const reports = path.join(sourceRoot, 'sarif');
  const sourcePath = path.join(sourceRoot, 'src', 'synthetic.js');
  fs.mkdirSync(reports);
  fs.mkdirSync(path.join(sourceRoot, '.github'));
  fs.mkdirSync(path.dirname(sourcePath));
  fs.writeFileSync(sourcePath, Array.from({ length: 20 }, (_, i) => `// Synthetic source line ${i + 1}\n`).join(''));
  fixtureGit(sourceRoot, ['init', '--quiet', '--template=']);
  fixtureGit(sourceRoot, ['add', '--', 'src/synthetic.js']);
  const entry = { ruleId: 'js/sql-injection', path: 'src/synthetic.js', startLine: 12,
    resultFingerprint: fingerprintOf(finding({ locations: [location('src/synthetic.js', 12)] })),
    sourceSha256: sourceFingerprint(fs.readFileSync(sourcePath)), maxOccurrences: 1, reviewer: 'Independent synthetic reviewer',
    reason: 'Synthetic reviewed false positive only', evidence: 'Synthetic bounded data-flow review' };
  const manifest = { version: 1, digestAlgorithm: 'sha256-lf', sourceTreeSha256: sourceTreeFingerprint(sourceRoot), reviews: [entry] };
  const manifestPath = path.join(sourceRoot, '.github', 'reviews.json');
  const writeManifest = (value = manifest) => {
    if (value?.reviews?.length === 0) {
      value = { ...value };
      delete value.sourceTreeSha256;
    }
    fs.writeFileSync(manifestPath, JSON.stringify(value));
  };
  writeManifest();
  const reviewedFinding = (overrides = {}) => finding({ locations: [location(entry.path, entry.startLine)], ...overrides });
  const auditReview = (value = report(run([reviewedFinding()])), outcome = 'success', options = {}) => {
    writeReport(reports, value);
    return auditDirectory(reports, outcome, { sourceRoot, reviewManifestPath: '.github/reviews.json', ...options });
  };
  return { sourceRoot, sourcePath, reports, manifestPath, entry, manifest, writeManifest, reviewedFinding, auditReview };
}

test('opt-in exact reviews preserve all findings and all level counts', t => {
  const f = reviewFixture(t);
  const results = ['error', 'warning', 'note', 'none'].map(level => f.reviewedFinding({ level,
    baselineState: 'unchanged', kind: 'notApplicable', suppressions: [{ kind: 'external', status: 'accepted' }] }));
  f.writeManifest({ ...f.manifest, reviews: results.map(result => ({ ...f.entry, resultFingerprint: fingerprintOf(result) })) });
  const value = f.auditReview(report(run(results)));
  assert.equal(value.ok, true);
  assert.deepEqual(value.totals, { reports: 1, runs: 1, results: 4, securityFindings: 4,
    levels: { none: 1, note: 1, warning: 1, error: 1 }, reviewedFindings: 4, unreviewedFindings: 0 });
  assert.equal(value.findings.length, 4);
  assert.ok(value.findings.every(item => item.reviewed === true));
  failed(auditDirectory(f.reports, 'success'), 'CODEQL_SECURITY_FINDINGS');
});

test('changed source invalidates a whole-file review even away from the alert line', t => {
  const f = reviewFixture(t);
  fs.appendFileSync(f.sourcePath, '// New code elsewhere in the file\n');
  const value = f.auditReview();
  failed(value, 'CODEQL_REVIEW_STALE');
  assert.equal(value.findings.length, 1);
  assert.equal(value.findings[0].reviewed, false);
  assert.equal(value.totals.securityFindings, 1);
});

test('sha256-lf normalizes CRLF only and rejects malformed UTF-8', t => {
  const f = reviewFixture(t);
  const lf = fs.readFileSync(f.sourcePath);
  const expected = crypto.createHash('sha256').update(lf).digest('hex');
  assert.equal(sourceFingerprint(lf), expected);
  fs.writeFileSync(f.sourcePath, lf.toString('utf8').replace(/\n/g, '\r\n'));
  assert.equal(f.auditReview().ok, true);
  assert.notEqual(sourceFingerprint(Buffer.from('x\ry')), sourceFingerprint(Buffer.from('x\ny')));
  assert.notEqual(sourceFingerprint(Buffer.from('\ufeffx\n')), sourceFingerprint(Buffer.from('x\n')));
  assert.notEqual(sourceFingerprint(Buffer.from('x \n')), sourceFingerprint(Buffer.from('x\n')));
  fs.writeFileSync(f.sourcePath, Buffer.from([0xff]));
  failed(f.auditReview(), 'CODEQL_REVIEW_INVALID');
});

test('new rules, paths and start lines block despite another exact reviewed finding', t => {
  const f = reviewFixture(t);
  for (const extra of [f.reviewedFinding({ locations: [location(f.entry.path, 13)] }),
    f.reviewedFinding({ locations: [location('src/new-file.js', 12)] }),
    f.reviewedFinding({ ruleId: 'js/xss', ruleIndex: 2 })]) {
    const current = run([f.reviewedFinding(), extra]);
    current.tool.driver.rules.push({ ...securityRule(), id: 'js/xss' });
    const value = f.auditReview(report(current));
    failed(value, 'CODEQL_SECURITY_FINDINGS');
    assert.equal(value.totals.reviewedFindings, 1);
    assert.equal(value.totals.unreviewedFindings, 1);
    assert.deepEqual(value.findings.map(item => item.reviewed), [true, false]);
  }
});

test('reviews require every primary location and never trust unsafe or foreign locations', t => {
  const f = reviewFixture(t);
  const foreign = location(f.entry.path);
  foreign.physicalLocation.artifactLocation.uriBaseId = 'OTHER_ROOT';
  const noLine = location(f.entry.path);
  delete noLine.physicalLocation.region;
  for (const locations of [[], [noLine], [foreign], [location(f.entry.path), location('../outside.js')],
    [location(f.entry.path), location('src/unreviewed.js')]]) {
    const value = f.auditReview(report(run([f.reviewedFinding({ locations }), f.reviewedFinding()])));
    failed(value, 'CODEQL_SECURITY_FINDINGS');
    assert.equal(value.findings[0].reviewed, false);
    assert.equal(value.findings[1].reviewed, true);
    assert.equal(value.totals.unreviewedFindings, 1);
  }
});

test('missing sources and stale registry paths fail closed and retain findings', t => {
  const f = reviewFixture(t);
  for (const filename of ['src/renamed.js', 'src/missing.js']) {
    f.writeManifest({ ...f.manifest, reviews: [{ ...f.entry, path: filename }] });
    const value = f.auditReview();
    failed(value, 'CODEQL_REVIEW_STALE');
    assert.equal(value.findings.length, 1);
    assert.equal(value.totals.unreviewedFindings, 1);
  }
  f.writeManifest();
  fs.unlinkSync(f.sourcePath);
  failed(f.auditReview(), 'CODEQL_REVIEW_UNAVAILABLE');
});

test('duplicate reviews are invalid and repeated same-sink results cannot inherit a single review', t => {
  const f = reviewFixture(t);
  f.writeManifest({ ...f.manifest, reviews: [f.entry, { ...f.entry }] });
  failed(f.auditReview(), 'CODEQL_REVIEW_INVALID');
  f.writeManifest();
  const value = f.auditReview(report(run([f.reviewedFinding(), f.reviewedFinding()])));
  failed(value, 'CODEQL_SECURITY_FINDINGS');
  assert.equal(value.findings.length, 2);
  assert.equal(value.totals.securityFindings, 2);
  assert.equal(value.totals.reviewedFindings, 0);
  assert.equal(value.totals.unreviewedFindings, 2);
  assert.ok(value.findings.every(item => item.reviewed === false));
});

test('suppression, baseline and lowered severity never approve unmatched emitted findings', t => {
  const f = reviewFixture(t);
  for (const level of ['error', 'warning', 'note', 'none']) {
    const value = f.auditReview(report(run([f.reviewedFinding({ level, baselineState: 'absent', kind: 'pass',
      locations: [location(f.entry.path, 13)], suppressions: [{ kind: 'external', status: 'accepted' }] })])));
    failed(value, 'CODEQL_SECURITY_FINDINGS');
    assert.equal(value.totals.levels[level], 1);
    assert.equal(value.totals.unreviewedFindings, 1);
  }
});

test('approved findings cannot override failed analysis or failed and incomplete scans', t => {
  const f = reviewFixture(t);
  for (const outcome of [undefined, '', 'failure', 'skipped', 'cancelled']) {
    writeReport(f.reports, report(run([f.reviewedFinding()])));
    failed(auditDirectory(f.reports, outcome, { sourceRoot: f.sourceRoot, reviewManifestPath: '.github/reviews.json' }),
      'CODEQL_ANALYSIS_UNSUCCESSFUL');
  }
  for (const mutate of [current => { current.invocations[0].executionSuccessful = false; },
    current => { current.properties = { resultsTruncated: true }; }]) {
    const current = run([f.reviewedFinding()]);
    mutate(current);
    failed(f.auditReview(report(current)));
  }
});

test('missing malformed unversioned and incomplete review registries fail closed even for empty scans', t => {
  const f = reviewFixture(t);
  for (const value of [null, [], {}, { ...f.manifest, version: 2 }, { ...f.manifest, digestAlgorithm: 'sha256' },
    { ...f.manifest, extra: 'not allowed' }, { version: 1, reviews: [f.entry] },
    { ...f.manifest, reviews: {} }, ...['reviewer', 'reason', 'evidence'].map(field => ({ ...f.manifest,
      reviews: [{ ...f.entry, [field]: ' ' }] })),
    { ...f.manifest, reviews: [{ ...f.entry, extra: true }] },
    { ...f.manifest, reviews: [{ ...f.entry, sourceSha256: 'bad' }] },
    { ...f.manifest, reviews: [{ ...f.entry, startLine: '12' }] }]) {
    f.writeManifest(value);
    failed(f.auditReview(report()), 'CODEQL_REVIEW_INVALID');
  }
  for (const content of ['{invalid', '', Buffer.from([0xff])]) {
    fs.writeFileSync(f.manifestPath, content);
    failed(f.auditReview(report()));
  }
  fs.unlinkSync(f.manifestPath);
  failed(f.auditReview(report()), 'CODEQL_REVIEW_UNAVAILABLE');
  failed(f.auditReview(report(), 'success', { reviewManifestPath: '' }), 'CODEQL_REVIEW_INVALID');
});

test('unsafe registry and source paths are rejected without reading outside the repository', t => {
  const f = reviewFixture(t);
  for (const filename of ['backend/recovery.json', 'reviews.json', '../outside.json', '/outside.json', 'C:/outside.json', 'src\\reviews.json',
    'file:///outside.json', 'reviews.json\u0000', 'src/../reviews.json', 'src//reviews.json']) {
    failed(f.auditReview(report(), 'success', { reviewManifestPath: filename }), 'CODEQL_REVIEW_INVALID');
  }
  for (const filename of ['../outside.js', '/outside.js', 'C:/outside.js', 'src\\outside.js',
    '.git/private.js', 'node_modules/private.js', 'backend/recovery.json', '.env', 'src/CON.js',
    'src/file.js.', 'src/file.js\n', 'src/' + 'x'.repeat(513)]) {
    f.writeManifest({ ...f.manifest, reviews: [{ ...f.entry, path: filename }] });
    failed(f.auditReview(), 'CODEQL_REVIEW_INVALID');
  }
});

test('registry and source read limits fail closed before oversized reads', t => {
  const f = reviewFixture(t);
  const enlarge = (filename, size) => {
    const fd = fs.openSync(filename, 'w');
    try { fs.ftruncateSync(fd, size); } finally { fs.closeSync(fd); }
  };
  enlarge(f.manifestPath, REVIEW_LIMITS.manifestBytes + 1);
  failed(f.auditReview(), 'CODEQL_REVIEW_LIMIT');
  f.writeManifest();
  enlarge(f.sourcePath, REVIEW_LIMITS.sourceBytes + 1);
  failed(f.auditReview(), 'CODEQL_REVIEW_LIMIT');
  f.writeManifest({ ...f.manifest, reviews: Array(REVIEW_LIMITS.entries + 1).fill(f.entry) });
  failed(f.auditReview(), 'CODEQL_REVIEW_LIMIT');
});

test('symlinked source or manifest ancestors, including Windows junctions, are never read', t => {
  const f = reviewFixture(t);
  const external = directory(t);
  fs.writeFileSync(path.join(external, 'synthetic.js'), fs.readFileSync(f.sourcePath));
  fs.writeFileSync(path.join(external, 'reviews.json'), JSON.stringify(f.manifest));
  const linked = path.join(f.sourceRoot, 'linked');
  fs.symlinkSync(external, linked, process.platform === 'win32' ? 'junction' : 'dir');
  f.writeManifest({ ...f.manifest, reviews: [{ ...f.entry, path: 'linked/synthetic.js' }] });
  failed(f.auditReview(report(run([f.reviewedFinding({ locations: [location('linked/synthetic.js')] })]))), 'CODEQL_REVIEW_UNSAFE');
  f.writeManifest();
  const linkedRegistry = path.join(f.sourceRoot, '.github', 'linked');
  fs.symlinkSync(external, linkedRegistry, process.platform === 'win32' ? 'junction' : 'dir');
  failed(f.auditReview(report(), 'success', { reviewManifestPath: '.github/linked/reviews.json' }), 'CODEQL_REVIEW_UNSAFE');
});

test('symlinked source and registry files fail closed', t => {
  const f = reviewFixture(t);
  const linkedSource = path.join(f.sourceRoot, 'src', 'linked.js');
  const linkedManifest = path.join(f.sourceRoot, '.github', 'linked.json');
  try {
    fs.symlinkSync(f.sourcePath, linkedSource, 'file');
    fs.symlinkSync(f.manifestPath, linkedManifest, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Windows file symlinks require a privilege; CI runs this on Linux');
      return;
    }
    throw error;
  }
  f.writeManifest({ ...f.manifest, reviews: [{ ...f.entry, path: 'src/linked.js' }] });
  failed(f.auditReview(report(run([f.reviewedFinding({ locations: [location('src/linked.js')] })]))), 'CODEQL_REVIEW_UNSAFE');
  f.writeManifest();
  failed(f.auditReview(report(), 'success', { reviewManifestPath: '.github/linked.json' }), 'CODEQL_REVIEW_UNSAFE');
});

test('CLI review opt-in logs every finding but never registry metadata or source contents', t => {
  const f = reviewFixture(t);
  const dir = f.reports;
  const gateScript = path.join(f.sourceRoot, 'scripts', 'check-conversation-codeql.js');
  fs.mkdirSync(path.dirname(gateScript));
  fs.copyFileSync(script, gateScript);
  fixtureGit(f.sourceRoot, ['add', '--', 'scripts/check-conversation-codeql.js']);
  const sourcePath = f.entry.path;
  const marker = 'SYNTHETIC_REVIEW_PRIVATE_METADATA';
  const entry = { ...f.entry,
    reviewer: marker, reason: marker, evidence: marker };
  const manifestPath = f.manifestPath;
  f.writeManifest({ ...f.manifest, sourceTreeSha256: sourceTreeFingerprint(f.sourceRoot), reviews: [entry] });
  const relativeManifest = '.github/reviews.json';
  const invoke = () => cli(dir, 'success', [dir], relativeManifest, gateScript);
  writeReport(dir, report(run([f.reviewedFinding(),
    finding({ level: 'none', locations: [location(sourcePath, 13)], suppressions: [{ kind: 'external', status: 'accepted' }] })])));
  const result = invoke();
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.includes(marker), false);
  const [summary, reviewed, unreviewed] = result.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(summary.totals.securityFindings, 2);
  assert.equal(summary.totals.reviewedFindings, 1);
  assert.equal(summary.totals.unreviewedFindings, 1);
  assert.match(summary.sourceTreeFingerprint, /^[a-f0-9]{64}$/);
  assert.match(reviewed.resultFingerprint, /^[a-f0-9]{64}$/);
  assert.match(unreviewed.resultFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(reviewed.sourceSha256, f.entry.sourceSha256);
  assert.equal(reviewed.locations[0].sourceSha256, f.entry.sourceSha256);
  assert.equal(unreviewed.sourceSha256, f.entry.sourceSha256);
  assert.equal(reviewed.reviewed, true);
  assert.equal(unreviewed.reviewed, false);
  writeReport(dir, report(run([f.reviewedFinding()])));
  assert.equal(invoke().status, 0);
  fs.writeFileSync(manifestPath, '{' + marker);
  const malformed = invoke();
  assert.equal(malformed.status, 1);
  assert.equal(malformed.stdout.includes(marker), false);
  assert.equal(malformed.stdout.trim().split('\n').length, 2);
});

test('an empty strict registry passes only a clean complete scan', t => {
  const f = reviewFixture(t);
  f.writeManifest({ ...f.manifest, reviews: [] });
  const clean = f.auditReview(report());
  assert.equal(clean.ok, true);
  assert.equal(clean.totals.reviewedFindings, 0);
  failed(f.auditReview(), 'CODEQL_SECURITY_FINDINGS');
});

test('registry paths absent from emitted SARIF cannot authorize source hashing', t => {
  const f = reviewFixture(t);
  fs.writeFileSync(path.join(f.sourceRoot, 'src', 'not-scanned.js'), Buffer.from([0xff]));
  f.writeManifest({ ...f.manifest, reviews: [{ ...f.entry, path: 'src/not-scanned.js' }] });
  const open = fs.openSync;
  let sourceOpens = 0;
  t.mock.method(fs, 'openSync', (filename, ...args) => {
    if (filename === path.join(f.sourceRoot, 'src', 'not-scanned.js')) sourceOpens++;
    return open(filename, ...args);
  });
  failed(f.auditReview(), 'CODEQL_REVIEW_STALE');
  assert.equal(sourceOpens, 0);
});

function trackSourceDescriptor(t, f, onOpen, onRead) {
  const open = fs.openSync, close = fs.closeSync, read = fs.readSync;
  let descriptor = null;
  let closes = 0;
  t.mock.method(fs, 'openSync', (filename, ...args) => {
    if (filename === f.sourcePath && descriptor === null) {
      // Reserve the slot before a race hook performs its own write/open.
      descriptor = -1;
      onOpen?.();
      descriptor = open(filename, ...args);
      return descriptor;
    }
    return open(filename, ...args);
  });
  t.mock.method(fs, 'readSync', (fd, ...args) => {
    const count = read(fd, ...args);
    if (fd === descriptor) onRead?.(args, count);
    return count;
  });
  t.mock.method(fs, 'closeSync', fd => {
    if (fd === descriptor) closes++;
    return close(fd);
  });
  return { descriptor: () => descriptor, closes: () => closes };
}

test('same-size same-time source replacement before open rejects initial inode changes and closes', t => {
  const f = reviewFixture(t);
  const initial = fs.statSync(f.sourcePath);
  const original = fs.readFileSync(f.sourcePath);
  const lstat = fs.lstatSync, fstat = fs.fstatSync;
  const tracked = trackSourceDescriptor(t, f, () => {
    fs.renameSync(f.sourcePath, path.join(f.sourceRoot, 'previous.js'));
    fs.writeFileSync(f.sourcePath, original);
  });
  // Equal timestamps and size deliberately leave only inode identity to catch the swap.
  t.mock.method(fs, 'lstatSync', filename => {
    const stat = lstat(filename);
    return filename === f.sourcePath ? Object.assign(stat, { mtimeMs: initial.mtimeMs, ctimeMs: initial.ctimeMs }) : stat;
  });
  t.mock.method(fs, 'fstatSync', fd => {
    const stat = fstat(fd);
    return fd === tracked.descriptor() ? Object.assign(stat, { mtimeMs: initial.mtimeMs, ctimeMs: initial.ctimeMs }) : stat;
  });
  failed(f.auditReview(), 'CODEQL_REVIEW_UNSAFE');
  assert.equal(tracked.closes(), 1);
});

test('pre-open ctime drift with stable inode size and mtime fails closed and closes', t => {
  const f = reviewFixture(t);
  const initial = fs.statSync(f.sourcePath);
  const lstat = fs.lstatSync, fstat = fs.fstatSync;
  let changed = false;
  const tracked = trackSourceDescriptor(t, f, () => { changed = true; });
  t.mock.method(fs, 'lstatSync', filename => {
    const stat = lstat(filename);
    return filename === f.sourcePath && changed ? Object.assign(stat, { ctimeMs: initial.ctimeMs + 1 }) : stat;
  });
  t.mock.method(fs, 'fstatSync', fd => {
    const stat = fstat(fd);
    return fd === tracked.descriptor() ? Object.assign(stat, { ctimeMs: initial.ctimeMs + 1 }) : stat;
  });
  failed(f.auditReview(), 'CODEQL_REVIEW_UNSAFE');
  assert.equal(tracked.closes(), 1);
});

test('path swap during a stable descriptor read fails the final inode check and closes', t => {
  const f = reviewFixture(t);
  const initial = fs.statSync(f.sourcePath);
  const original = fs.readFileSync(f.sourcePath);
  const lstat = fs.lstatSync, fstat = fs.fstatSync;
  let swapped = false;
  const tracked = trackSourceDescriptor(t, f, undefined, () => {
    if (swapped) return;
    swapped = true;
    fs.renameSync(f.sourcePath, path.join(f.sourceRoot, 'previous.js'));
    fs.writeFileSync(f.sourcePath, original);
  });
  t.mock.method(fs, 'lstatSync', filename => {
    const stat = lstat(filename);
    return filename === f.sourcePath ? Object.assign(stat, { mtimeMs: initial.mtimeMs, ctimeMs: initial.ctimeMs }) : stat;
  });
  t.mock.method(fs, 'fstatSync', fd => {
    const stat = fstat(fd);
    return fd === tracked.descriptor() ? Object.assign(stat, { mtimeMs: initial.mtimeMs, ctimeMs: initial.ctimeMs }) : stat;
  });
  failed(f.auditReview(), 'CODEQL_REVIEW_UNSAFE');
  assert.equal(tracked.closes(), 1);
});

test('source growth during a read fails within the original buffer bound and closes', t => {
  const f = reviewFixture(t);
  const initial = fs.statSync(f.sourcePath);
  let appended = false;
  const tracked = trackSourceDescriptor(t, f, undefined, args => {
    assert.equal(args[0].length, initial.size + 1);
    if (!appended) {
      appended = true;
      fs.appendFileSync(f.sourcePath, '// added code\n');
    }
  });
  failed(f.auditReview(), 'CODEQL_REVIEW_UNSAFE');
  assert.equal(tracked.closes(), 1);
});

function trackedFile(f, filename, content) {
  const target = path.join(f.sourceRoot, filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  fixtureGit(f.sourceRoot, ['add', '--', filename]);
  return target;
}

test('other callers, JSON, configuration, native code, bundles and data paths bind the tree', t => {
  const f = reviewFixture(t);
  const names = ['src/caller.js', 'config/runtime.json', 'config/runtime.yaml', 'native/source.rs',
    'db/schema.sql', 'winga-modules.bundle.js', 'data/runtime.json', 'uploads/runtime.js',
    'docs/runtime.js', 'package-lock.json', 'backend/mix.lock', 'config/opaque-extension'];
  for (const name of names) trackedFile(f, name, 'synthetic runtime input\n');
  const sourceTreeSha256 = sourceTreeFingerprint(f.sourceRoot);
  f.writeManifest({ ...f.manifest, sourceTreeSha256 });
  assert.equal(f.auditReview().ok, true);
  const sinkHash = sourceFingerprint(fs.readFileSync(f.sourcePath));
  for (const name of names) {
    fs.appendFileSync(path.join(f.sourceRoot, name), 'changed upstream input\n');
    failed(f.auditReview(), 'CODEQL_REVIEW_STALE');
    assert.equal(sourceFingerprint(fs.readFileSync(f.sourcePath)), sinkHash);
    fs.writeFileSync(path.join(f.sourceRoot, name), 'synthetic runtime input\n');
  }
  assert.equal(f.auditReview().ok, true);
});

test('new tracked files invalidate reviews but untracked files are never read', t => {
  const f = reviewFixture(t);
  const filename = path.join(f.sourceRoot, 'src/new-caller.js');
  fs.writeFileSync(filename, Buffer.from([0xff]));
  const open = fs.openSync;
  let opens = 0;
  t.mock.method(fs, 'openSync', (target, ...args) => {
    if (target === filename) opens++;
    return open(target, ...args);
  });
  assert.equal(f.auditReview().ok, true);
  assert.equal(opens, 0);
  fs.writeFileSync(filename, 'synthetic new caller\n');
  fixtureGit(f.sourceRoot, ['add', '--', 'src/new-caller.js']);
  failed(f.auditReview(), 'CODEQL_REVIEW_STALE');
  assert.equal(opens, 1);
});

test('tracked file modes and POSIX working-tree executable modes invalidate reviews', t => {
  const f = reviewFixture(t);
  fixtureGit(f.sourceRoot, ['update-index', '--chmod=+x', '--', 'src/synthetic.js']);
  if (process.platform !== 'win32') fs.chmodSync(f.sourcePath, 0o755);
  failed(f.auditReview(), 'CODEQL_REVIEW_STALE');
  fixtureGit(f.sourceRoot, ['update-index', '--chmod=-x', '--', 'src/synthetic.js']);
  if (process.platform !== 'win32') fs.chmodSync(f.sourcePath, 0o644);
  assert.equal(f.auditReview().ok, true);
  if (process.platform !== 'win32') {
    fs.chmodSync(f.sourcePath, 0o755);
    failed(f.auditReview(), 'CODEQL_REVIEW_STALE');
  }
});

test('only the exact ledger and explicit non-runtime documents are excluded', t => {
  const f = reviewFixture(t);
  const excluded = ['README.md', 'docs/conversations-final-acceptance-20261009.md'];
  for (const name of excluded) trackedFile(f, name, 'synthetic report\n');
  fixtureGit(f.sourceRoot, ['add', '--', '.github/reviews.json']);
  const sourceTreeSha256 = sourceTreeFingerprint(f.sourceRoot, '.github/reviews.json');
  f.writeManifest({ ...f.manifest, sourceTreeSha256 });
  for (const name of excluded) fs.appendFileSync(path.join(f.sourceRoot, name), 'updated report\n');
  assert.equal(sourceTreeFingerprint(f.sourceRoot, '.github/reviews.json'), sourceTreeSha256);
  assert.equal(f.auditReview().ok, true);
  f.writeManifest({ ...f.manifest, sourceTreeSha256, reviews: [{ ...f.entry, reason: 'Changed review notes' }] });
  assert.equal(f.auditReview().ok, true);
  trackedFile(f, 'docs/new-unknown.md', 'potential imported runtime input\n');
  failed(f.auditReview(), 'CODEQL_REVIEW_STALE');
  assert.notEqual(sourceTreeFingerprint(f.sourceRoot), sourceTreeSha256);
});

test('binary assets hash raw bytes while known text normalizes CRLF only', t => {
  const f = reviewFixture(t);
  const binary = trackedFile(f, 'assets/synthetic.png', Buffer.from([0x89, 0x50, 0xff, 0x0d, 0x0a]));
  const config = trackedFile(f, 'config/runtime.json', '{"synthetic":true}\n');
  const sourceTreeSha256 = sourceTreeFingerprint(f.sourceRoot);
  f.writeManifest({ ...f.manifest, sourceTreeSha256 });
  assert.equal(f.auditReview().ok, true);
  fs.writeFileSync(config, '{"synthetic":true}\r\n');
  assert.equal(f.auditReview().ok, true);
  fs.writeFileSync(binary, Buffer.from([0x89, 0x50, 0xff, 0x0a]));
  failed(f.auditReview(), 'CODEQL_REVIEW_STALE');
});

test('sensitive tracked paths fail closed before any tracked content is opened', t => {
  for (const name of ['.env', '.ENV', 'backend/.env.production', 'src/.env.example',
    'private/synthetic.json', 'profiles/synthetic.json', '.aws/synthetic.json', 'certs/synthetic.key']) {
    const f = reviewFixture(t);
    trackedFile(f, name, 'synthetic placeholder only\n');
    const open = fs.openSync;
    let opens = 0;
    const mock = t.mock.method(fs, 'openSync', (...args) => { opens++; return open(...args); });
    assert.throws(() => sourceTreeFingerprint(f.sourceRoot), error => error.errorCode === 'CODEQL_REVIEW_UNSAFE');
    assert.equal(opens, 0);
    mock.mock.restore();
  }
});

test('only the two exact public env templates are included and fingerprinted', t => {
  const f = reviewFixture(t);
  for (const name of ['.env.production.example', 'backend/.env.example']) trackedFile(f, name, 'SYNTHETIC_PLACEHOLDER=\n');
  const sourceTreeSha256 = sourceTreeFingerprint(f.sourceRoot);
  f.writeManifest({ ...f.manifest, sourceTreeSha256 });
  assert.equal(f.auditReview().ok, true);
  fs.appendFileSync(path.join(f.sourceRoot, 'backend/.env.example'), 'NEW_SYNTHETIC_PLACEHOLDER=\n');
  failed(f.auditReview(), 'CODEQL_REVIEW_STALE');
});

test('tracked symlink modes and absent tracked files fail closed without following links', t => {
  const f = reviewFixture(t);
  const oid = crypto.createHash('sha1').update(Buffer.from('blob 0\0')).digest('hex');
  fixtureGit(f.sourceRoot, ['update-index', '--add', '--cacheinfo', `120000,${oid},src/synthetic-link.js`]);
  const open = fs.openSync;
  let opens = 0;
  const mock = t.mock.method(fs, 'openSync', (...args) => { opens++; return open(...args); });
  assert.throws(() => sourceTreeFingerprint(f.sourceRoot), error => error.errorCode === 'CODEQL_REVIEW_UNSAFE');
  assert.equal(opens, 0);
  mock.mock.restore();
  fixtureGit(f.sourceRoot, ['update-index', '--force-remove', '--', 'src/synthetic-link.js']);
  fs.unlinkSync(f.sourcePath);
  failed(f.auditReview(), 'CODEQL_REVIEW_UNAVAILABLE');
});

test('full flow fingerprints prevent a replacement or additional same-sink flow inheriting review', t => {
  const f = reviewFixture(t);
  const old = f.reviewedFinding({ codeFlows: [{ threadFlows: [{ locations: [{ location: location('src/caller.js', 2) }] }] }] });
  const newer = structuredClone(old);
  newer.codeFlows[0].threadFlows[0].locations[0].location.physicalLocation.region.startLine = 3;
  f.writeManifest({ ...f.manifest, reviews: [{ ...f.entry, resultFingerprint: fingerprintOf(old) }] });
  assert.equal(f.auditReview(report(run([old]))).ok, true);
  const replacement = f.auditReview(report(run([newer])));
  failed(replacement, 'CODEQL_SECURITY_FINDINGS');
  assert.equal(replacement.totals.reviewedFindings, 0);
  const additional = f.auditReview(report(run([old, newer])));
  failed(additional, 'CODEQL_SECURITY_FINDINGS');
  assert.deepEqual(additional.findings.map(item => item.reviewed), [true, false]);
  assert.equal(additional.totals.unreviewedFindings, 1);
  assert.notEqual(additional.findings[0].resultFingerprint, additional.findings[1].resultFingerprint);
});

test('complete result and resolved rule, tool and indexed-flow metadata bind the review', t => {
  const f = reviewFixture(t);
  for (const mutate of [
    current => { current.results[0].message.text = 'Different result'; },
    current => { current.results[0].relatedLocations = [location('src/caller.js', 7)]; },
    current => { current.results[0].properties = { distinct: true }; },
    current => { current.results[0].locations[0].physicalLocation.region.snippet = { text: 'changed snippet' }; },
    current => { current.tool.driver.rules[0].properties['security-severity'] = '9.0'; },
    current => { current.tool.driver.version = '2.25.0'; },
    current => { current.threadFlowLocations = [{ location: location('src/caller.js', 5) }]; },
    current => { current.artifacts = [{ location: { uri: 'src/caller.js' } }]; }
  ]) {
    const current = run([f.reviewedFinding()]);
    mutate(current);
    const value = f.auditReview(report(current));
    failed(value, 'CODEQL_SECURITY_FINDINGS');
    assert.equal(value.totals.reviewedFindings, 0);
    assert.notEqual(value.findings[0].resultFingerprint, f.entry.resultFingerprint);
  }
});

test('canonical fingerprints ignore object key insertion order but preserve array order', t => {
  const f = reviewFixture(t);
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reorder(value[key])])) : value;
  assert.equal(f.auditReview(reorder(report(run([f.reviewedFinding()])))).ok, true);
  const old = f.reviewedFinding({ codeFlows: [{ properties: { steps: [1, 2] } }] });
  const newer = f.reviewedFinding({ codeFlows: [{ properties: { steps: [2, 1] } }] });
  assert.notEqual(fingerprintOf(old), fingerprintOf(newer));
});

test('approved multiplicity is global across reports and runs, never per-file or per-sink counts', t => {
  const f = reviewFixture(t);
  f.writeManifest({ ...f.manifest, reviews: [{ ...f.entry, maxOccurrences: 2 }] });
  writeReport(f.reports, report(run([f.reviewedFinding()])), 'z.sarif');
  const current = report(run([f.reviewedFinding()]), run([f.reviewedFinding()]));
  const excess = f.auditReview(current);
  failed(excess, 'CODEQL_SECURITY_FINDINGS');
  assert.equal(excess.totals.securityFindings, 3);
  assert.equal(excess.totals.reviewedFindings, 0);
  assert.equal(excess.totals.unreviewedFindings, 3);
  f.writeManifest({ ...f.manifest, reviews: [{ ...f.entry, maxOccurrences: 3 }] });
  assert.equal(f.auditReview(current).ok, true);
});

test('an empty ledger emits tree and result hashes but blocks every finding at every level', t => {
  const f = reviewFixture(t);
  f.writeManifest({ ...f.manifest, reviews: [] });
  const current = report(run(['none', 'note', 'warning', 'error'].map(level => f.reviewedFinding({ level }))));
  const value = f.auditReview(current);
  failed(value, 'CODEQL_SECURITY_FINDINGS');
  assert.match(value.sourceTreeFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(value.totals.securityFindings, 4);
  assert.equal(value.totals.reviewedFindings, 0);
  assert.equal(value.totals.unreviewedFindings, 4);
  assert.ok(value.findings.every(item => !item.reviewed && /^[a-f0-9]{64}$/.test(item.resultFingerprint)));
  assert.ok(value.findings.every(item => item.sourceSha256 === f.entry.sourceSha256));
});

test('even an exact full-result fingerprint cannot approve unsafe or foreign primary locations', t => {
  const f = reviewFixture(t);
  const foreign = location(f.entry.path);
  foreign.physicalLocation.artifactLocation.uriBaseId = 'OTHER_ROOT';
  for (const locations of [[location(f.entry.path), location('../outside.js')],
    [location(f.entry.path), foreign]]) {
    const unsafe = f.reviewedFinding({ locations });
    f.writeManifest({ ...f.manifest, reviews: [f.entry, { ...f.entry, resultFingerprint: fingerprintOf(unsafe) }] });
    const value = f.auditReview(report(run([unsafe, f.reviewedFinding()])));
    failed(value, 'CODEQL_SECURITY_FINDINGS');
    assert.deepEqual(value.findings.map(item => item.reviewed), [false, true]);
  }
});

test('every safe primary location needs an exact entry and emits its own source hash', t => {
  const f = reviewFixture(t);
  const other = trackedFile(f, 'src/other.js', '// Other synthetic source\n');
  const current = f.reviewedFinding({ locations: [location(f.entry.path, 12), location('src/other.js', 1)] });
  const first = { ...f.entry, resultFingerprint: fingerprintOf(current) };
  const sourceTreeSha256 = sourceTreeFingerprint(f.sourceRoot);
  f.writeManifest({ ...f.manifest, sourceTreeSha256, reviews: [first] });
  const unmatched = f.auditReview(report(run([current])));
  failed(unmatched, 'CODEQL_SECURITY_FINDINGS');
  assert.equal(unmatched.findings[0].reviewed, false);
  const second = { ...first, path: 'src/other.js', startLine: 1, sourceSha256: sourceFingerprint(fs.readFileSync(other)) };
  f.writeManifest({ ...f.manifest, sourceTreeSha256, reviews: [first, second] });
  const approved = f.auditReview(report(run([current])));
  assert.equal(approved.ok, true);
  assert.deepEqual(approved.findings[0].locations.map(item => item.sourceSha256), [first.sourceSha256, second.sourceSha256]);
  assert.equal(Object.hasOwn(approved.findings[0], 'sourceSha256'), false);
});

test('safe hashing does not open untracked or foreign SARIF source paths', t => {
  const f = reviewFixture(t);
  const filename = path.join(f.sourceRoot, 'src/untracked.js');
  fs.writeFileSync(filename, Buffer.from([0xff]));
  f.writeManifest({ ...f.manifest, reviews: [] });
  const open = fs.openSync;
  let opens = 0;
  t.mock.method(fs, 'openSync', (target, ...args) => {
    if (target === filename) opens++;
    return open(target, ...args);
  });
  const foreign = location(f.entry.path);
  foreign.physicalLocation.artifactLocation.uriBaseId = 'OTHER_ROOT';
  const value = f.auditReview(report(run([f.reviewedFinding({ locations: [location('src/untracked.js')] }),
    f.reviewedFinding({ locations: [foreign] })])));
  failed(value, 'CODEQL_SECURITY_FINDINGS');
  assert.equal(opens, 0);
  assert.ok(value.findings.every(item => !Object.hasOwn(item, 'sourceSha256')
    && !Object.hasOwn(item.locations[0], 'sourceSha256')));
});

test('missing flow hashes, malformed multiplicity and a missing tree binding are invalid', t => {
  const f = reviewFixture(t);
  const missing = { ...f.entry };
  delete missing.resultFingerprint;
  for (const entry of [missing, { ...f.entry, resultFingerprint: 'bad' },
    ...[0, -1, 1.5, '1', LIMITS.results + 1].map(maxOccurrences => ({ ...f.entry, maxOccurrences }))]) {
    f.writeManifest({ ...f.manifest, reviews: [entry] });
    failed(f.auditReview(), 'CODEQL_REVIEW_INVALID');
  }
  const manifest = { ...f.manifest };
  delete manifest.sourceTreeSha256;
  f.writeManifest(manifest);
  failed(f.auditReview(), 'CODEQL_REVIEW_INVALID');
});

test('later reads cannot hide a changed earlier file or a changed tracked inventory', t => {
  const f = reviewFixture(t);
  const later = trackedFile(f, 'src/z-later.js', '// Later synthetic input\n');
  const open = fs.openSync;
  let changed = false;
  const mock = t.mock.method(fs, 'openSync', (target, ...args) => {
    if (target === later && !changed) {
      changed = true;
      fs.appendFileSync(f.sourcePath, '// Changed after its descriptor closed\n');
    }
    return open(target, ...args);
  });
  assert.throws(() => sourceTreeFingerprint(f.sourceRoot), error => error.errorCode === 'CODEQL_REVIEW_UNSAFE');
  mock.mock.restore();
  changed = false;
  t.mock.method(fs, 'openSync', (target, ...args) => {
    if (target === later && !changed) {
      changed = true;
      trackedFile(f, 'src/new-tracked.js', '// New inventory member\n');
    }
    return open(target, ...args);
  });
  assert.throws(() => sourceTreeFingerprint(f.sourceRoot), error => error.errorCode === 'CODEQL_REVIEW_UNSAFE');
});

test('tracked file count and aggregate bytes are bounded before excess content reads', t => {
  assert.equal(REVIEW_LIMITS.treeFiles, 2048);
  assert.equal(REVIEW_LIMITS.treeBytes, 64 * 1024 * 1024);
  assert.equal(REVIEW_LIMITS.sourceBytes, 8 * 1024 * 1024);
  const f = reviewFixture(t);
  const data = Buffer.alloc(REVIEW_LIMITS.sourceBytes, 0xff);
  for (let i = 0; i < 9; i++) {
    const filename = path.join(f.sourceRoot, `asset-${i}.bin`);
    fs.writeFileSync(filename, data);
  }
  fixtureGit(f.sourceRoot, ['add', '--', '*.bin']);
  const open = fs.openSync;
  let contentBytes = 0;
  const mock = t.mock.method(fs, 'openSync', (target, ...args) => {
    contentBytes += fs.statSync(target).size;
    return open(target, ...args);
  });
  assert.throws(() => sourceTreeFingerprint(f.sourceRoot), error => error.errorCode === 'CODEQL_REVIEW_LIMIT');
  assert.ok(contentBytes <= REVIEW_LIMITS.treeBytes);
  mock.mock.restore();
  const many = reviewFixture(t);
  fs.mkdirSync(path.join(many.sourceRoot, 'many'));
  for (let i = 0; i < REVIEW_LIMITS.treeFiles; i++) fs.writeFileSync(path.join(many.sourceRoot, 'many', `${i}.bin`), '');
  fixtureGit(many.sourceRoot, ['add', '--', 'many']);
  let opens = 0;
  t.mock.method(fs, 'openSync', (...args) => { opens++; return open(...args); });
  assert.throws(() => sourceTreeFingerprint(many.sourceRoot), error => error.errorCode === 'CODEQL_REVIEW_LIMIT');
  assert.equal(opens, 0);
});

test('literal bracket route paths and internal spaces are tracked, hashed and exactly reviewable', t => {
  const f = reviewFixture(t);
  for (const filename of ['api/[...path].js', 'api/product/[id].js', 'src/internal space.js']) {
    const target = trackedFile(f, filename, '// Synthetic route source\n');
    const sourceTreeSha256 = sourceTreeFingerprint(f.sourceRoot);
    const current = f.reviewedFinding({ locations: [location(filename, 1)] });
    const entry = { ...f.entry, path: filename, startLine: 1,
      sourceSha256: sourceFingerprint(fs.readFileSync(target)), resultFingerprint: fingerprintOf(current) };
    f.writeManifest({ ...f.manifest, sourceTreeSha256, reviews: [entry] });
    const value = f.auditReview(report(run([current])));
    assert.equal(value.ok, true);
    assert.equal(value.findings[0].locations[0].path, filename);
    assert.equal(value.findings[0].sourceSha256, entry.sourceSha256);
    fs.appendFileSync(target, '// New route code\n');
    failed(f.auditReview(report(run([current]))), 'CODEQL_REVIEW_STALE');
  }
});

test('bracket acceptance cannot admit traversal, controls, absolute paths or ambiguous Windows names', t => {
  const f = reviewFixture(t);
  for (const filename of ['api/[id]/../outside.js', '/api/[id].js', 'C:/api/[id].js',
    'api\\[id].js', 'api/[id].js\n', 'api/[id].js ', 'api/ [id].js', 'api/[id].js.',
    'api/[id]:stream.js', 'api/[id];command.js', 'api/[id]/NUL.js']) {
    f.writeManifest({ ...f.manifest, reviews: [{ ...f.entry, path: filename }] });
    failed(f.auditReview(), 'CODEQL_REVIEW_INVALID');
  }
});
