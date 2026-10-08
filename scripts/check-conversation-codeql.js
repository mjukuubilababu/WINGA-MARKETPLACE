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

function requireValid(condition, errorCode = 'CODEQL_SARIF_INVALID') {
  if (!condition) throw Object.assign(new Error(errorCode), { errorCode });
}

// Examine structure, never print untrusted diagnostics, snippets, or parser errors.
function requireComplete(report) {
  const stack = [{ value: report, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    requireValid(++nodes <= LIMITS.nodes && depth <= LIMITS.depth, 'CODEQL_SARIF_LIMIT');
    for (const [key, child] of Object.entries(value)) {
      if (/truncat|incomplete|partialResults|omittedResults|resultsOmitted|resultsFiltered/i.test(key)) {
        requireValid(child === false || child === 0 || child === 'false' || child === '0'
          || child === null, 'CODEQL_SARIF_INCOMPLETE');
      }
      if (key === 'externalPropertyFileReferences' || key === 'inlineExternalProperties') {
        requireValid(object(child) || Array.isArray(child));
        requireValid(Object.keys(child).length === 0, 'CODEQL_SARIF_INCOMPLETE');
      }
      if (key === 'incrementalMode') requireValid(child === '', 'CODEQL_SARIF_INCOMPLETE');
      if (child !== null && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
    }
  }
}

function requireMessage(message) {
  requireValid(object(message) && (text(message.text) || text(message.markdown) || text(message.id)));
}

function securitySeverity(properties) {
  if (!own(properties, 'security-severity')) return null;
  const value = properties['security-severity'];
  requireValid(typeof value === 'string' && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value));
  const number = Number(value);
  requireValid(Number.isFinite(number) && number >= 0 && number <= 10);
  return number;
}

function describeRule(rule) {
  requireValid(object(rule) && text(rule.id));
  const properties = optional(rule.properties, {});
  requireValid(object(properties));
  const tags = optional(properties.tags, []);
  requireValid(Array.isArray(tags) && tags.every(text));
  const severity = securitySeverity(properties);
  if (own(rule, 'defaultConfiguration')) {
    requireValid(object(rule.defaultConfiguration));
    if (own(rule.defaultConfiguration, 'level')) requireValid(LEVELS.has(rule.defaultConfiguration.level));
  }
  return { rule, security: tags.some(tag => tag.toLowerCase() === 'security') || severity > 0, severity };
}

function ruleComponents(run) {
  requireValid(object(run.tool) && object(run.tool.driver) && run.tool.driver.name === 'CodeQL');
  const extensions = optional(run.tool.extensions, []);
  requireValid(Array.isArray(extensions));
  const components = [run.tool.driver, ...extensions].map(component => {
    requireValid(object(component) && text(component.name));
    const rules = optional(component.rules, []);
    requireValid(Array.isArray(rules));
    const descriptions = rules.map(describeRule);
    const byId = new Map(descriptions.map(description => [description.rule.id, description]));
    requireValid(byId.size === rules.length);
    return { component, descriptions, byId };
  });
  requireValid(components.some(component => component.descriptions.some(rule => rule.security)),
    'CODEQL_SECURITY_RULES_MISSING');
  return components;
}

function resolveRule(result, components) {
  const reference = result.rule;
  if (own(result, 'rule')) requireValid(object(reference));
  let component = components[0];
  if (reference && own(reference, 'toolComponent')) {
    const target = reference.toolComponent;
    requireValid(object(target));
    if (own(target, 'index')) {
      requireValid(index(target.index) && target.index + 1 < components.length);
      component = components[target.index + 1];
    } else {
      requireValid(text(target.name) || text(target.guid));
      const matches = components.filter(candidate =>
        (!own(target, 'name') || candidate.component.name === target.name)
        && (!own(target, 'guid') || candidate.component.guid === target.guid));
      requireValid(matches.length === 1);
      [component] = matches;
    }
    if (own(target, 'name')) requireValid(target.name === component.component.name);
    if (own(target, 'guid')) requireValid(target.guid === component.component.guid);
  }
  const ids = [];
  const indices = [];
  if (own(result, 'ruleId')) { requireValid(text(result.ruleId)); ids.push(result.ruleId); }
  if (reference && own(reference, 'id')) { requireValid(text(reference.id)); ids.push(reference.id); }
  if (own(result, 'ruleIndex')) { requireValid(index(result.ruleIndex)); indices.push(result.ruleIndex); }
  if (reference && own(reference, 'index')) { requireValid(index(reference.index)); indices.push(reference.index); }
  requireValid(ids.length + indices.length > 0);
  requireValid(ids.every(id => id === ids[0]) && indices.every(value => value === indices[0]));
  const description = indices.length ? component.descriptions[indices[0]] : component.byId.get(ids[0]);
  requireValid(description && ids.every(id => id === description.rule.id));
  // Unclassified rule metadata cannot establish that a result is non-security.
  requireValid(description.security || description.rule.properties?.tags?.length > 0);
  return description;
}

function requireInvocations(run) {
  requireValid(Array.isArray(run.invocations) && run.invocations.length > 0, 'CODEQL_EXECUTION_UNVERIFIED');
  for (const invocation of run.invocations) {
    requireValid(object(invocation) && invocation.executionSuccessful === true, 'CODEQL_EXECUTION_UNSUCCESSFUL');
    if (own(invocation, 'exitCode')) requireValid(invocation.exitCode === 0, 'CODEQL_EXECUTION_UNSUCCESSFUL');
    for (const key of ['processStartFailureMessage', 'exitSignalName', 'exitSignalNumber']) {
      requireValid(!own(invocation, key), 'CODEQL_EXECUTION_UNSUCCESSFUL');
    }
    for (const key of ['toolExecutionNotifications', 'toolConfigurationNotifications']) {
      if (!own(invocation, key)) continue;
      requireValid(Array.isArray(invocation[key]));
      for (const notification of invocation[key]) {
        requireValid(object(notification));
        requireMessage(notification.message);
        const level = optional(notification.level, 'warning');
        requireValid(LEVELS.has(level));
        requireValid(level === 'note' || level === 'none', 'CODEQL_EXECUTION_DIAGNOSTIC');
        const diagnostic = [notification.descriptor?.id, notification.message.text, notification.message.markdown]
          .filter(value => typeof value === 'string').join(' ');
        requireValid(!/truncat|incomplete|partial|timed[ -]?out|timeout|abort|fail(?:ed|ure)?|fatal|cancel(?:led|ed)|skipp/i
          .test(diagnostic), 'CODEQL_SARIF_INCOMPLETE');
      }
    }
  }
}

function safeRuleId(id) {
  return id.length <= 160 && /^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(id) ? id : null;
}

function safeLocation(location, run) {
  requireValid(object(location));
  if (!own(location, 'physicalLocation')) return null;
  const physical = location.physicalLocation;
  requireValid(object(physical));
  let artifact = physical.artifactLocation;
  requireValid(object(artifact));
  if (own(artifact, 'index')) {
    requireValid(index(artifact.index) && Array.isArray(run.artifacts) && object(run.artifacts[artifact.index]));
    const referenced = run.artifacts[artifact.index].location;
    requireValid(object(referenced));
    if (!own(artifact, 'uri')) artifact = referenced;
    else if (own(referenced, 'uri')) requireValid(artifact.uri === referenced.uri);
  }
  requireValid(text(artifact.uri));
  const uri = artifact.uri;
  // Only repository-relative ASCII paths; omit absolute URLs, credentials and control characters.
  const safePath = uri.length <= 512 && /^[a-zA-Z0-9_. /-]+$/.test(uri) && !uri.startsWith('/')
    && uri.split('/').every(part => part && part !== '.' && part !== '..');
  const region = physical.region;
  if (region !== undefined) {
    requireValid(object(region));
    for (const key of ['startLine', 'startColumn', 'endLine', 'endColumn']) {
      if (own(region, key)) requireValid(index(region[key]) && region[key] > 0);
    }
  }
  return safePath ? { path: uri, line: region?.startLine ?? null } : null;
}

function inspectReport(report, reportIndex) {
  requireValid(object(report) && report.version === '2.1.0');
  requireValid(Array.isArray(report.runs) && report.runs.length > 0 && report.runs.length <= LIMITS.runs);
  requireComplete(report);
  const findings = [];
  let resultCount = 0;
  const levels = { none: 0, note: 0, warning: 0, error: 0 };
  for (const [runIndex, run] of report.runs.entries()) {
    requireValid(object(run) && Array.isArray(run.results));
    const components = ruleComponents(run);
    requireInvocations(run);
    resultCount += run.results.length;
    requireValid(resultCount <= LIMITS.results, 'CODEQL_SARIF_LIMIT');
    for (const [resultIndex, result] of run.results.entries()) {
      requireValid(object(result));
      requireMessage(result.message);
      const description = resolveRule(result, components);
      const level = optional(result.level, description.rule.defaultConfiguration?.level ?? 'warning');
      requireValid(LEVELS.has(level));
      if (own(result, 'kind')) requireValid(KINDS.has(result.kind));
      const locations = optional(result.locations, []);
      requireValid(Array.isArray(locations));
      const safeLocations = locations.map(location => safeLocation(location, run)).filter(Boolean);
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
  try {
    requireValid(text(directory), 'CODEQL_REPORTS_MISSING');
    requireValid(fs.lstatSync(directory).isDirectory(), 'CODEQL_REPORTS_MISSING');
    // The official analyze action writes language reports directly into its output directory.
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const reports = entries.filter(entry => entry.name.toLowerCase().endsWith('.sarif'))
      .sort((left, right) => left.name.localeCompare(right.name));
    requireValid(reports.length > 0, 'CODEQL_REPORTS_MISSING');
    requireValid(reports.length <= LIMITS.files, 'CODEQL_SARIF_LIMIT');
    const totals = { reports: reports.length, runs: 0, results: 0, securityFindings: 0,
      levels: { none: 0, note: 0, warning: 0, error: 0 } };
    const findings = [];
    let totalBytes = 0;
    const files = reports.map(entry => {
      requireValid(entry.isFile() && !entry.isSymbolicLink());
      const filename = path.join(directory, entry.name);
      const stat = fs.lstatSync(filename);
      requireValid(stat.isFile() && stat.size > 0);
      totalBytes += stat.size;
      requireValid(stat.size <= LIMITS.fileBytes && totalBytes <= LIMITS.totalBytes, 'CODEQL_SARIF_LIMIT');
      return { filename, stat };
    });
    for (const [reportIndex, { filename, stat }] of files.entries()) {
      // A fixed-size read also bounds growth between the stat and read operations.
      const buffer = Buffer.alloc(stat.size + 1);
      const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
      let length = 0;
      try {
        requireValid(fs.fstatSync(fd).isFile());
        while (length < buffer.length) {
          const read = fs.readSync(fd, buffer, length, buffer.length - length, null);
          if (read === 0) break;
          length += read;
        }
      } finally { fs.closeSync(fd); }
      requireValid(length === stat.size, 'CODEQL_SARIF_INCOMPLETE');
      let report;
      try { report = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))); }
      catch { requireValid(false); }
      const inspected = inspectReport(report, reportIndex);
      totals.runs += inspected.runs;
      totals.results += inspected.results;
      requireValid(totals.results <= LIMITS.results, 'CODEQL_SARIF_LIMIT');
      for (const level of LEVELS) totals.levels[level] += inspected.levels[level];
      for (const finding of inspected.findings) findings.push(finding);
    }
    totals.securityFindings = findings.length;
    const executionVerified = analysisOutcome === 'success';
    const ok = executionVerified && findings.length === 0;
    return { ok, ...(!executionVerified ? { errorCode: 'CODEQL_ANALYSIS_UNSUCCESSFUL' }
      : findings.length ? { errorCode: 'CODEQL_SECURITY_FINDINGS' } : {}), totals, findings };
  } catch (error) {
    return { ok: false, errorCode: error.errorCode ?? 'CODEQL_SARIF_UNAVAILABLE' };
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
