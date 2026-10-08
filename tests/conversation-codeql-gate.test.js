const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { auditDirectory, inspectReport, LIMITS } = require('../scripts/check-conversation-codeql');

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

function cli(dir, outcome, args = [dir]) {
  if (arguments.length < 2) outcome = 'success';
  const env = { ...process.env, CODEQL_ANALYSIS_OUTCOME: outcome, CODEQL_SARIF_DIRECTORY: dir };
  if (outcome === undefined) delete env.CODEQL_ANALYSIS_OUTCOME;
  delete env.NODE_OPTIONS;
  return spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8',
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
      { stage: 'result-schema', field: 'message', report: 0, run: 0, result: 0 }],
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
    [v => { v.runs[0].results[0].message = { text: '', privateMarker }; }, 'result-schema', 'message'],
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
    locations: [{ path: 'backend/synthetic-gate.js', line: 12 }] });
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
  assert.match(job, /run: node scripts\/check-conversation-codeql\.js/);
  assert.match(job, /queries: security-extended/);
  assert.doesNotMatch(job, /continue-on-error|upload-artifact|secrets\.|actions: write|contents: write|upload: never/);
});
