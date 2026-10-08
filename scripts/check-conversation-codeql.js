const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const LIMITS = Object.freeze({ fileBytes: 32 * 1024 * 1024, totalBytes: 128 * 1024 * 1024,
  files: 32, runs: 20, results: 100000, nodes: 1000000, depth: 100 });
const LEVELS = new Set(['none', 'note', 'warning', 'error']);
const KINDS = new Set(['notApplicable', 'pass', 'fail', 'review', 'open', 'informational']);
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const index = value => Number.isSafeInteger(value) && value >= 0;
const optional = (value, fallback) => value === undefined ? fallback : value;

function requireValid(condition, errorCode = 'CODEQL_SARIF_INVALID', diagnostic) {
  if (!condition) throw Object.assign(new Error(errorCode), { errorCode, diagnostic });
}

// Only caller-defined enums and numeric indexes enter diagnostics, never SARIF values or keys.
function validator(stage, context = {}) {
  return (condition, field, errorCode = 'CODEQL_SARIF_INVALID') =>
    requireValid(condition, errorCode, { stage, field, ...context });
}

// Examine structure, never print untrusted diagnostics, snippets, or parser errors.
function requireComplete(report, context) {
  const check = validator('completeness', context);
  const stack = [{ value: report, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    check(++nodes <= LIMITS.nodes && depth <= LIMITS.depth, 'structure-bounds', 'CODEQL_SARIF_LIMIT');
    for (const [key, child] of Object.entries(value)) {
      if (/truncat|incomplete|partialResults|omittedResults|resultsOmitted|resultsFiltered/i.test(key)) {
        check(child === false || child === 0 || child === 'false' || child === '0'
          || child === null, 'truncation-marker', 'CODEQL_SARIF_INCOMPLETE');
      }
      if (key === 'externalPropertyFileReferences' || key === 'inlineExternalProperties') {
        check(object(child) || Array.isArray(child), 'external-property-references');
        check(Object.keys(child).length === 0, 'external-property-references', 'CODEQL_SARIF_INCOMPLETE');
      }
      if (key === 'incrementalMode') check(child === '', 'incremental-mode', 'CODEQL_SARIF_INCOMPLETE');
      if (child !== null && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
    }
  }
}

function requireMessage(message, check) {
  check(object(message) && (text(message.text) || text(message.markdown) || text(message.id)), 'message');
}

function securitySeverity(properties, check) {
  if (!own(properties, 'security-severity')) return null;
  const value = properties['security-severity'];
  check(typeof value === 'string' && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value), 'security-severity');
  const number = Number(value);
  check(Number.isFinite(number) && number >= 0 && number <= 10, 'security-severity');
  return number;
}

function describeRule(rule, context) {
  const check = validator('rule-metadata', context);
  check(object(rule) && text(rule.id), 'rule.id');
  const properties = optional(rule.properties, {});
  check(object(properties), 'rule.properties');
  const tags = optional(properties.tags, []);
  check(Array.isArray(tags) && tags.every(text), 'rule.tags');
  const severity = securitySeverity(properties, check);
  if (own(rule, 'defaultConfiguration')) {
    check(object(rule.defaultConfiguration), 'rule.default-configuration');
    if (own(rule.defaultConfiguration, 'level')) check(LEVELS.has(rule.defaultConfiguration.level), 'rule.level');
  }
  return { rule, security: tags.some(tag => tag.toLowerCase() === 'security') || severity > 0, severity };
}

function ruleComponents(run, context) {
  const check = validator('tool-metadata', context);
  check(object(run.tool) && object(run.tool.driver), 'tool.driver');
  check(['CodeQL', 'CodeQL command-line toolchain'].includes(run.tool.driver.name), 'tool.driver.name');
  const extensions = optional(run.tool.extensions, []);
  check(Array.isArray(extensions), 'tool.extensions');
  const components = [run.tool.driver, ...extensions].map((component, componentIndex) => {
    const check = validator('tool-metadata', { ...context, component: componentIndex });
    check(object(component) && text(component.name), 'component.name');
    const rules = optional(component.rules, []);
    check(Array.isArray(rules), 'component.rules');
    const descriptions = rules.map((rule, ruleIndex) => describeRule(rule,
      { ...context, component: componentIndex, rule: ruleIndex }));
    const byId = new Map(descriptions.map(description => [description.rule.id, description]));
    check(byId.size === rules.length, 'component.rule-ids');
    return { component, descriptions, byId };
  });
  check(components.some(component => component.descriptions.some(rule => rule.security)),
    'security-rules', 'CODEQL_SECURITY_RULES_MISSING');
  return components;
}

function resolveRule(result, components, context) {
  const check = validator('rule-reference', context);
  const reference = result.rule;
  if (own(result, 'rule')) check(object(reference), 'result.rule');
  let component = components[0];
  if (reference && own(reference, 'toolComponent')) {
    const target = reference.toolComponent;
    check(object(target), 'rule.tool-component');
    if (own(target, 'index')) {
      check(index(target.index) && target.index + 1 < components.length, 'tool-component.index');
      component = components[target.index + 1];
    } else {
      check(text(target.name) || text(target.guid), 'tool-component.identity');
      const matches = components.filter(candidate =>
        (!own(target, 'name') || candidate.component.name === target.name)
        && (!own(target, 'guid') || candidate.component.guid === target.guid));
      check(matches.length === 1, 'tool-component.resolution');
      [component] = matches;
    }
    if (own(target, 'name')) check(target.name === component.component.name, 'tool-component.name');
    if (own(target, 'guid')) check(target.guid === component.component.guid, 'tool-component.guid');
  }
  const ids = [];
  const indices = [];
  if (own(result, 'ruleId')) { check(text(result.ruleId), 'result.rule-id'); ids.push(result.ruleId); }
  if (reference && own(reference, 'id')) { check(text(reference.id), 'rule.id'); ids.push(reference.id); }
  if (own(result, 'ruleIndex')) { check(index(result.ruleIndex), 'result.rule-index'); indices.push(result.ruleIndex); }
  if (reference && own(reference, 'index')) { check(index(reference.index), 'rule.index'); indices.push(reference.index); }
  check(ids.length + indices.length > 0, 'rule.identity');
  check(ids.every(id => id === ids[0]) && indices.every(value => value === indices[0]), 'rule.consistency');
  const description = indices.length ? component.descriptions[indices[0]] : component.byId.get(ids[0]);
  check(description && ids.every(id => id === description.rule.id), 'rule.resolution');
  // Unclassified rule metadata cannot establish that a result is non-security.
  check(description.security || description.rule.properties?.tags?.length > 0, 'rule.classification');
  return description;
}

function requireInvocations(run, context) {
  validator('execution', context)(Array.isArray(run.invocations) && run.invocations.length > 0,
    'invocations', 'CODEQL_EXECUTION_UNVERIFIED');
  for (const [invocationIndex, invocation] of run.invocations.entries()) {
    const check = validator('execution', { ...context, invocation: invocationIndex });
    check(object(invocation) && invocation.executionSuccessful === true,
      'execution-successful', 'CODEQL_EXECUTION_UNSUCCESSFUL');
    if (own(invocation, 'exitCode')) check(invocation.exitCode === 0, 'exit-code', 'CODEQL_EXECUTION_UNSUCCESSFUL');
    for (const key of ['processStartFailureMessage', 'exitSignalName', 'exitSignalNumber']) {
      check(!own(invocation, key), 'execution-failure-metadata', 'CODEQL_EXECUTION_UNSUCCESSFUL');
    }
    for (const key of ['toolExecutionNotifications', 'toolConfigurationNotifications']) {
      if (!own(invocation, key)) continue;
      check(Array.isArray(invocation[key]), key);
      for (const [notificationIndex, notification] of invocation[key].entries()) {
        const check = validator('execution', { ...context, invocation: invocationIndex, notification: notificationIndex });
        check(object(notification), 'notification');
        requireMessage(notification.message, check);
        const level = optional(notification.level, 'warning');
        check(LEVELS.has(level), 'notification.level');
        check(level === 'note' || level === 'none', 'notification.level', 'CODEQL_EXECUTION_DIAGNOSTIC');
        const diagnostic = [notification.descriptor?.id, notification.message.text, notification.message.markdown]
          .filter(value => typeof value === 'string').join(' ');
        check(!/truncat|incomplete|partial|timed[ -]?out|timeout|abort|fail(?:ed|ure)?|fatal|cancel(?:led|ed)|skipp/i
          .test(diagnostic), 'notification.completeness', 'CODEQL_SARIF_INCOMPLETE');
      }
    }
  }
}

function safeRuleId(id) {
  return id.length <= 160 && /^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(id) ? id : null;
}

function safeLocation(location, run, context) {
  const check = validator('location', context);
  check(object(location), 'location');
  if (!own(location, 'physicalLocation')) return null;
  const physical = location.physicalLocation;
  check(object(physical), 'physical-location');
  let artifact = physical.artifactLocation;
  check(object(artifact), 'artifact-location');
  if (own(artifact, 'index')) {
    check(index(artifact.index) && Array.isArray(run.artifacts) && object(run.artifacts[artifact.index]), 'artifact.index');
    const referenced = run.artifacts[artifact.index].location;
    check(object(referenced), 'artifact.reference');
    if (!own(artifact, 'uri')) artifact = referenced;
    else if (own(referenced, 'uri')) check(artifact.uri === referenced.uri, 'artifact.uri-consistency');
  }
  check(text(artifact.uri), 'artifact.uri');
  const uri = artifact.uri;
  // Only repository-relative ASCII paths; omit absolute URLs, credentials and control characters.
  const safePath = uri.length <= 512 && /^[a-zA-Z0-9_. /-]+$/.test(uri) && !uri.startsWith('/')
    && uri.split('/').every(part => part && part !== '.' && part !== '..');
  const region = physical.region;
  if (region !== undefined) {
    check(object(region), 'region');
    for (const key of ['startLine', 'startColumn', 'endLine', 'endColumn']) {
      if (own(region, key)) check(index(region[key]) && region[key] > 0, key);
    }
  }
  return safePath ? { path: uri, line: region?.startLine ?? null } : null;
}

function inspectReport(report, reportIndex) {
  const context = { report: reportIndex };
  const check = validator('report-schema', context);
  check(object(report), 'report');
  check(report.version === '2.1.0', 'version');
  check(Array.isArray(report.runs) && report.runs.length > 0 && report.runs.length <= LIMITS.runs, 'runs');
  requireComplete(report, context);
  const findings = [];
  let resultCount = 0;
  const levels = { none: 0, note: 0, warning: 0, error: 0 };
  for (const [runIndex, run] of report.runs.entries()) {
    const context = { report: reportIndex, run: runIndex };
    const check = validator('run-schema', context);
    check(object(run), 'run');
    check(Array.isArray(run.results), 'results');
    const components = ruleComponents(run, context);
    requireInvocations(run, context);
    resultCount += run.results.length;
    check(resultCount <= LIMITS.results, 'result-count', 'CODEQL_SARIF_LIMIT');
    for (const [resultIndex, result] of run.results.entries()) {
      const context = { report: reportIndex, run: runIndex, result: resultIndex };
      const check = validator('result-schema', context);
      check(object(result), 'result');
      requireMessage(result.message, check);
      const description = resolveRule(result, components, context);
      const level = optional(result.level, description.rule.defaultConfiguration?.level ?? 'warning');
      check(LEVELS.has(level), 'level');
      if (own(result, 'kind')) check(KINDS.has(result.kind), 'kind');
      const locations = optional(result.locations, []);
      check(Array.isArray(locations), 'locations');
      const safeLocations = locations.map((location, locationIndex) => safeLocation(location, run,
        { ...context, location: locationIndex })).filter(Boolean);
      if (!description.security) continue;
      // Baseline, suppression, level and kind never exempt an emitted security finding.
      levels[level]++;
      findings.push({ report: reportIndex, run: runIndex, result: resultIndex,
        ruleId: safeRuleId(description.rule.id), level, securitySeverity: description.severity,
        locations: safeLocations });
    }
  }
  return { runs: report.runs.length, results: resultCount, levels, findings };
}

function auditDirectory(directory, analysisOutcome) {
  let context = {};
  const check = (condition, field, errorCode) => validator('report-files', context)(condition, field, errorCode);
  try {
    check(text(directory), 'directory', 'CODEQL_REPORTS_MISSING');
    check(fs.lstatSync(directory).isDirectory(), 'directory', 'CODEQL_REPORTS_MISSING');
    // The official analyze action writes language reports directly into its output directory.
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const reports = entries.filter(entry => entry.name.toLowerCase().endsWith('.sarif'))
      .sort((left, right) => left.name.localeCompare(right.name));
    check(reports.length > 0, 'report-count', 'CODEQL_REPORTS_MISSING');
    check(reports.length <= LIMITS.files, 'report-count', 'CODEQL_SARIF_LIMIT');
    const totals = { reports: reports.length, runs: 0, results: 0, securityFindings: 0,
      levels: { none: 0, note: 0, warning: 0, error: 0 } };
    const findings = [];
    let totalBytes = 0;
    const files = reports.map((entry, reportIndex) => {
      context = { report: reportIndex };
      check(entry.isFile() && !entry.isSymbolicLink(), 'file-type');
      const filename = path.join(directory, entry.name);
      const stat = fs.lstatSync(filename);
      check(stat.isFile() && stat.size > 0, 'file-size');
      totalBytes += stat.size;
      check(stat.size <= LIMITS.fileBytes && totalBytes <= LIMITS.totalBytes, 'byte-bounds', 'CODEQL_SARIF_LIMIT');
      return { filename, stat };
    });
    for (const [reportIndex, { filename, stat }] of files.entries()) {
      context = { report: reportIndex };
      // A fixed-size read also bounds growth between the stat and read operations.
      const buffer = Buffer.alloc(stat.size + 1);
      const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
      let length = 0;
      try {
        check(fs.fstatSync(fd).isFile(), 'file-type');
        while (length < buffer.length) {
          const read = fs.readSync(fd, buffer, length, buffer.length - length, null);
          if (read === 0) break;
          length += read;
        }
      } finally { fs.closeSync(fd); }
      check(length === stat.size, 'read-size', 'CODEQL_SARIF_INCOMPLETE');
      let report;
      try { report = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))); }
      catch { validator('report-parse', context)(false, 'json-utf8'); }
      const inspected = inspectReport(report, reportIndex);
      totals.runs += inspected.runs;
      totals.results += inspected.results;
      check(totals.results <= LIMITS.results, 'result-count', 'CODEQL_SARIF_LIMIT');
      for (const level of LEVELS) totals.levels[level] += inspected.levels[level];
      for (const finding of inspected.findings) findings.push(finding);
    }
    totals.securityFindings = findings.length;
    const executionVerified = analysisOutcome === 'success';
    const ok = executionVerified && findings.length === 0;
    return { ok, ...(!executionVerified ? { errorCode: 'CODEQL_ANALYSIS_UNSUCCESSFUL' }
      : findings.length ? { errorCode: 'CODEQL_SECURITY_FINDINGS' } : {}), totals, findings };
  } catch (error) {
    return { ok: false, errorCode: error.errorCode ?? 'CODEQL_SARIF_UNAVAILABLE',
      diagnostic: error.diagnostic ?? { stage: 'report-files', field: 'file-access', ...context } };
  }
}

function main() {
  const args = process.argv.slice(2);
  const result = args.length > 1 ? { ok: false, errorCode: 'CODEQL_GATE_ARGUMENTS_INVALID' }
    : auditDirectory(args[0] ?? process.env.CODEQL_SARIF_DIRECTORY, process.env.CODEQL_ANALYSIS_OUTCOME);
  const { findings, ...summary } = result;
  console.log(JSON.stringify({ mode: 'conversation-codeql-gate', privacy: 'aggregate-only', ...summary }));
  // All findings remain retrievable in job logs without uploading raw, source-bearing SARIF artifacts.
  for (const finding of findings ?? []) console.log(JSON.stringify({ mode: 'codeql-finding-location', ...finding }));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { auditDirectory, inspectReport, LIMITS };
