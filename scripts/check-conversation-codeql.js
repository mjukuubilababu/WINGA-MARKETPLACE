const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { TextDecoder } = require('node:util');

const LIMITS = Object.freeze({ fileBytes: 32 * 1024 * 1024, totalBytes: 128 * 1024 * 1024,
  files: 32, runs: 20, results: 100000, nodes: 1000000, depth: 100 });
const LEVELS = new Set(['none', 'note', 'warning', 'error']);
const KINDS = new Set(['notApplicable', 'pass', 'fail', 'review', 'open', 'informational']);
const REVIEW_LIMITS = Object.freeze({ manifestBytes: 256 * 1024, entries: 1000,
  sourceBytes: 8 * 1024 * 1024, totalSourceBytes: 64 * 1024 * 1024, sourceFiles: 128,
  treeFiles: 2048, treeBytes: 64 * 1024 * 1024, trackedListBytes: 2 * 1024 * 1024 });
const REVIEWABLE_LOCATIONS = Symbol('reviewable-locations');
const SOURCE_LOCATION = Symbol('source-location');
const FINGERPRINT_DIAGNOSTIC_LIMIT = 64;
const ARTIFACT_DIAGNOSTIC_LIMIT = 2048;
const ARTIFACT_DIAGNOSTIC_FIELDS = Object.freeze(['location', 'parentIndex', 'offset', 'length', 'roles',
  'mimeType', 'encoding', 'sourceLanguage', 'hashes', 'contents', 'lastModifiedTimeUtc', 'description', 'properties']);
const RUN_REFERENCE_FIELDS = Object.freeze(['artifacts', 'threadFlowLocations', 'logicalLocations', 'originalUriBaseIds', 'taxonomies']);
const FINGERPRINT_DIAGNOSTIC_FIELDS = Object.freeze({
  result: ['guid', 'correlationGuid', 'ruleId', 'ruleIndex', 'rule', 'message', 'locations', 'relatedLocations',
    'codeFlows', 'partialFingerprints', 'fingerprints', 'properties', 'baselineState', 'suppressions', 'rank', 'level', 'kind', 'provenance'],
  rule: ['id', 'guid', 'name', 'defaultConfiguration', 'properties', 'messageStrings', 'shortDescription', 'fullDescription', 'help', 'helpUri'],
  toolComponent: ['guid', 'name', 'fullName', 'version', 'semanticVersion', 'releaseDateUtc', 'locations',
    'properties', 'organization', 'informationUri', 'downloadUri', 'globalMessageStrings'],
  runReferences: RUN_REFERENCE_FIELDS
});
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const index = value => Number.isSafeInteger(value) && value >= 0;
const optional = (value, fallback) => value === undefined ? fallback : value;

function requireValid(condition, errorCode = 'CODEQL_SARIF_INVALID', diagnostic) {
  if (!condition) throw Object.assign(new Error(errorCode), { errorCode, diagnostic });
}

// Only fixed enums, numeric indexes and bounded shape flags enter diagnostics, never SARIF contents.
function validator(stage, context = {}) {
  return (condition, field, errorCode = 'CODEQL_SARIF_INVALID', shape = {}) =>
    requireValid(condition, errorCode, { stage, field, ...context, ...shape });
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
  const type = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const shape = { messageType: type(message), textType: type(message?.text),
    textEmpty: message?.text === '', idType: type(message?.id), markdownType: type(message?.markdown) };
  // The SARIF JSON schema permits empty text; it is never evidence of successful execution.
  const valid = object(message) && (own(message, 'text') || text(message.id))
    && ['text', 'markdown', 'id'].every(key => !own(message, key) || typeof message[key] === 'string')
    && (!own(message, 'id') || text(message.id))
    && (!own(message, 'arguments') || (Array.isArray(message.arguments) && message.arguments.every(value => typeof value === 'string')));
  check(valid, 'message', 'CODEQL_SARIF_INVALID', { messageShape: shape });
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
  return { ...description, toolComponent: Object.fromEntries(Object.entries(component.component).filter(([key]) => key !== 'rules')) };
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
        const diagnostic = [notification.descriptor?.id, notification.message.text, notification.message.markdown,
          notification.message.id, ...(notification.message.arguments ?? [])]
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

function safeRepositoryPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512
    && /^[A-Za-z0-9_.\[\] \/-]+$/.test(value) && !value.startsWith('/')
    && value.split('/').every(part => part && part !== '.' && part !== '..'
      && part.trim() === part && !part.endsWith('.') && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

function safeSourcePath(value) {
  return safeRepositoryPath(value) && /\.(?:js|mjs|cjs|jsx|ts|tsx|html|htm|vue)$/i.test(value)
    && value.split('/').every(part => !part.startsWith('.') && part !== 'node_modules');
}

function sourceFingerprint(buffer) {
  const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  return crypto.createHash('sha256').update(source.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

const NON_RUNTIME_DOCUMENTS = new Set([
  'README.md', 'AGENTS.md', 'CHANGELOG.md', 'LICENSE.md', 'LICENSE.txt',
  'docs/audits/e2ee-20261003.md', 'docs/audits/e2ee-release-20261003.md',
  'docs/conversations-final-acceptance-20261009.md',
  'docs/conversations-audit-fixes-20261008.md', 'docs/conversations-audit-soak-20261008.md'
]);
const PUBLIC_ENV_TEMPLATES = new Set(['.env.production.example', 'backend/.env.example']);
const TEXT_CONFIG_NAMES = new Set([
  '.gitignore', '.gitattributes', '.gitmodules', '.gitkeep', '.editorconfig',
  '.npmrc', '.npmignore', '.pnpmrc', '.yarnrc', '.yarnclean', '.yarnignore',
  '.nvmrc', '.node-version', '.python-version', '.ruby-version', '.tool-versions',
  '.browserslistrc', '.babelrc', '.eslintrc', '.eslintignore', '.prettierrc', '.prettierignore',
  '.stylelintrc', '.stylelintignore', '.lintstagedrc', '.huskyrc', '.ignore',
  '.dockerignore', '.containerignore', '.vercelignore', '.slugignore', '.replit',
  'dockerfile', 'containerfile', 'makefile', 'gnumakefile', 'cmakelists.txt', 'caddyfile',
  'procfile', 'gemfile', 'rakefile', 'brewfile', 'vagrantfile', 'justfile', 'jenkinsfile',
  '_headers', '_redirects', 'readme', 'license', 'notice', 'copying', 'authors', 'changelog'
]);

function isKnownTextPath(filename) {
  return /\.(?:js|mjs|cjs|jsx|ts|tsx|html|htm|vue|css|ex|exs|heex|eex|sql|rs|py|sh|ps1|bat|yml|yaml|toml|c|h|cpp|m|mm|swift|json|jsonc|webmanifest|lock|xml|svg|md|txt|conf|cfg|ini|properties|example)$/i.test(filename)
    || PUBLIC_ENV_TEMPLATES.has(filename) || TEXT_CONFIG_NAMES.has(path.posix.basename(filename).toLowerCase());
}

const sensitivePath = filename => !PUBLIC_ENV_TEMPLATES.has(filename)
  && (/(?:^|\/)\.env(?:\.|$)/i.test(filename)
    || /(?:^|\/)(?:private|profiles|browser-profiles|recovery-data|\.aws|\.ssh|\.codex|\.git)(?:\/|$)/i.test(filename)
    || /\.(?:pem|key|p12|pfx)$/i.test(filename));

function inspectSourceTree(root, ledger) {
  const check = validator('review-source-tree');
  root = path.resolve(root);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  const git = args => execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    '-C', root, ...args], { env, windowsHide: true, timeout: 15000,
    maxBuffer: REVIEW_LIMITS.trackedListBytes, stdio: ['ignore', 'pipe', 'pipe'] });
  check(path.resolve(git(['rev-parse', '--show-toplevel']).toString('utf8').trim()) === root,
    'repository-root', 'CODEQL_REVIEW_UNSAFE');
  check(safeRepositoryPath(ledger) && ledger.startsWith('.github/') && ledger.endsWith('.json'),
    'ledger-path', 'CODEQL_REVIEW_INVALID');
  const tracked = new TextDecoder('utf-8', { fatal: true }).decode(git(['ls-files', '--stage', '-z']));
  check(tracked.endsWith('\0'), 'tracked-files', 'CODEQL_REVIEW_INVALID');
  const inventory = tracked.slice(0, -1).split('\0').map(record => {
    const tab = record.indexOf('\t'), header = record.slice(0, tab).split(' '), filename = record.slice(tab + 1);
    check(tab > 0 && header.length === 3 && header[2] === '0', 'tracked-entry', 'CODEQL_REVIEW_UNSAFE');
    return { filename, mode: header[0] };
  });
  check(inventory.length > 0 && inventory.length <= REVIEW_LIMITS.treeFiles
    && new Set(inventory.map(file => file.filename)).size === inventory.length, 'source-count', 'CODEQL_REVIEW_LIMIT');
  // Validate the complete inventory before opening even one tracked content file.
  for (const { filename, mode } of inventory) {
    check(safeRepositoryPath(filename) && ['100644', '100755'].includes(mode), 'source-path', 'CODEQL_REVIEW_UNSAFE');
    check(!sensitivePath(filename), 'sensitive-path', 'CODEQL_REVIEW_UNSAFE');
  }
  const sourceFiles = inventory.filter(({ filename }) => filename !== ledger && !NON_RUNTIME_DOCUMENTS.has(filename))
    .sort((left, right) => left.filename < right.filename ? -1 : left.filename > right.filename ? 1 : 0);
  let bytes = 0;
  const identities = [];
  const sources = new Map();
  const files = sourceFiles.map(({ filename, mode }) => {
    let verified;
    const source = readReviewFile(root, filename, Math.min(REVIEW_LIMITS.sourceBytes, REVIEW_LIMITS.treeBytes - bytes),
      check, true, stat => { verified = stat; });
    identities.push({ filename, stat: verified });
    bytes += source.length;
    check(bytes <= REVIEW_LIMITS.treeBytes, 'source-byte-bounds', 'CODEQL_REVIEW_LIMIT');
    const textFile = isKnownTextPath(filename);
    let fingerprint;
    try { fingerprint = textFile ? sourceFingerprint(source) : crypto.createHash('sha256').update(source).digest('hex'); }
    catch { check(false, 'source-utf8', 'CODEQL_REVIEW_INVALID'); }
    sources.set(filename, { sha256: fingerprint, bytes: source.length });
    const effectiveMode = process.platform === 'win32' ? mode
      : verified.mode & 0o111 ? '100755' : '100644';
    return [filename, mode, effectiveMode, textFile ? 'sha256-lf' : 'sha256-bytes', fingerprint];
  });
  // A tree digest cannot mix files or inventory from different working-tree states.
  check(git(['ls-files', '--stage', '-z']).equals(Buffer.from(tracked, 'utf8')),
    'tracked-inventory-change', 'CODEQL_REVIEW_UNSAFE');
  for (const { filename, stat } of identities) {
    const target = path.join(root, filename), current = fs.lstatSync(target);
    check(sameFile(current, stat) && fs.realpathSync(target) === target,
      'tree-file-change', 'CODEQL_REVIEW_UNSAFE');
  }
  return { fingerprint: crypto.createHash('sha256').update(JSON.stringify(['winga-codeql-tracked-tree', 1, files])).digest('hex'), sources };
}

function sourceTreeFingerprint(root = path.join(__dirname, '..'), ledger = '.github/codeql-reviewed-findings.v1.json') {
  return inspectSourceTree(root, ledger).fingerprint;
}

function canonicalFingerprint(value) {
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function referencedRunMetadata(run) {
  return Object.fromEntries(RUN_REFERENCE_FIELDS
    .filter(key => own(run, key)).map(key => [key, run[key]]));
}

function referencedArtifactClosure(result, description, run, cache) {
  const check = validator('artifact-closure');
  const valid = (condition, field) => check(condition, field, 'CODEQL_ARTIFACT_CLOSURE_INVALID');
  cache.remaining ??= LIMITS.nodes;
  let workCount = 0;
  const work = () => { workCount++; valid(cache.remaining-- > 0, 'closure.work-limit'); };
  const references = referencedRunMetadata(run);
  const artifacts = optional(run.artifacts, []);
  check(Array.isArray(artifacts), 'artifacts', 'CODEQL_ARTIFACT_CLOSURE_INVALID');
  const key = value => JSON.stringify([value.uri, own(value, 'uriBaseId') ? value.uriBaseId : null]);
  const uriOnlyIdentity = value => object(value) && typeof value.uri === 'string'
    && /^[A-Za-z0-9_.\/-]+$/.test(value.uri) && safeRepositoryPath(value.uri)
    && (!own(value, 'uriBaseId') || value.uriBaseId === '%SRCROOT%');
  let byUri = cache.byUri;
  if (!byUri) {
    byUri = new Map();
    cache.uriOnlySupported = true;
    cache.uriOnlyBases = new Set();
    artifacts.forEach((artifact, i) => {
      work();
      cache.uriOnlySupported &&= uriOnlyIdentity(artifact?.location);
      cache.uriOnlyBases.add(artifact?.location?.uriBaseId ?? null);
      if (object(artifact?.location) && text(artifact.location.uri)) {
        const identity = key(artifact.location);
        if (!byUri.has(identity)) byUri.set(identity, []);
        byUri.get(identity).push(i);
      }
    });
    cache.byUri = byUri;
  }
  const selected = new Set(), active = new Set(), activeBases = new Set(), completedBases = new Set();
  let unindexedReferences = 0, unmatchedUriReferences = 0;
  const base = name => {
    work();
    // Opaque base identifiers remain bound even when the report supplies no resolution table.
    if (!own(run, 'originalUriBaseIds')) return;
    valid(object(run.originalUriBaseIds) && own(run.originalUriBaseIds, name), 'base.dangling');
    valid(!activeBases.has(name), 'base.cycle');
    if (completedBases.has(name)) return;
    valid(activeBases.size + active.size < LIMITS.depth, 'closure.depth');
    activeBases.add(name);
    resolve(run.originalUriBaseIds[name], undefined, true);
    activeBases.delete(name);
    completedBases.add(name);
  };
  const resolve = (value, self, baseDefinition = false) => {
    work();
    valid(object(value), 'reference.shape');
    valid(!own(value, 'uri') || text(value.uri), 'reference.uri');
    valid(!own(value, 'uriBaseId') || text(value.uriBaseId), 'reference.base');
    valid(own(value, 'index') || own(value, 'uri'), 'reference.identity');
    if (own(value, 'uriBaseId')) base(value.uriBaseId);
    if (own(value, 'index')) {
      valid(index(value.index) && value.index < artifacts.length && object(artifacts[value.index]), 'reference.index');
      if (self !== undefined) valid(value.index === self, 'artifact.self-index');
      const target = artifacts[value.index].location;
      if (own(value, 'uri') || own(value, 'uriBaseId')) {
        valid(object(target) && (!own(value, 'uri') || value.uri === target.uri)
          && (own(value, 'uri') ? key(value) === key(target)
            : !own(value, 'uriBaseId') || value.uriBaseId === target.uriBaseId), 'reference.consistency');
      }
      if (self === undefined) select(value.index);
    } else if (self === undefined) {
      // Raw URI/base pairs cannot establish alias identity through a supplied base-resolution table.
      valid(baseDefinition || !own(run, 'originalUriBaseIds'), 'reference.unsupported-alias');
      if (!baseDefinition) {
        valid(uriOnlyIdentity(value), 'reference.unsupported-uri');
        valid(cache.uriOnlySupported && [...cache.uriOnlyBases].every(name => name === (value.uriBaseId ?? null)),
          'reference.unsupported-table-identity');
      }
      unindexedReferences++;
      const matches = byUri.get(key(value)) ?? [];
      valid(matches.length <= 1, 'reference.ambiguous');
      valid(baseDefinition || artifacts.length === 0 || matches.length === 1, 'reference.unmatched-uri');
      if (matches.length) select(matches[0]);
      else unmatchedUriReferences++; // Complete URI-only references have no implicit table dependency.
    }
    walk(Object.fromEntries(Object.entries(value).filter(([name]) => !['uri', 'uriBaseId', 'index'].includes(name))));
  };
  const walk = value => {
    work();
    if (!value || typeof value !== 'object') return;
    for (const [name, child] of Object.entries(value)) {
      if (name === 'artifactLocation' || name === 'analysisTarget') resolve(child);
      else {
        // URI-shaped objects outside known SARIF reference slots cannot be silently classified as data.
        valid(!object(child) || (!own(child, 'uri') && !own(child, 'uriBaseId')), 'reference.uncertain');
        walk(child);
      }
    }
  };
  const select = i => {
    work();
    valid(!active.has(i), 'artifact.cycle');
    if (selected.has(i)) return;
    valid(activeBases.size + active.size < LIMITS.depth, 'closure.depth');
    active.add(i);
    const artifact = artifacts[i];
    valid(object(artifact), 'artifact.shape');
    valid(object(artifact.location) && text(artifact.location.uri), 'artifact.identity');
    resolve(artifact.location, i);
    if (own(artifact, 'parentIndex')) {
      valid(index(artifact.parentIndex) && artifact.parentIndex < artifacts.length, 'artifact.parent-index');
      select(artifact.parentIndex);
    }
    walk(Object.fromEntries(Object.entries(artifact).filter(([name]) => !['location', 'parentIndex'].includes(name))));
    active.delete(i);
    selected.add(i);
  };
  walk(result);
  walk(description.rule);
  const tool = description.toolComponent;
  if (own(tool, 'locations')) {
    valid(Array.isArray(tool.locations), 'tool.locations');
    tool.locations.forEach(value => resolve(value));
  }
  walk(Object.fromEntries(Object.entries(tool).filter(([name]) => name !== 'locations')));
  for (const [name, value] of Object.entries(references)) {
    if (name === 'artifacts') continue;
    if (name === 'originalUriBaseIds') {
      valid(object(value), 'bases.shape');
      Object.keys(value).forEach(base);
    } else walk(value);
  }
  const records = [...selected].sort((a, b) => a - b).map(i => [i, artifacts[i]]);
  return { references: { ...references, artifacts: records }, diagnostics: {
    version: 2, eligible: true, sha256: canonicalFingerprint(records), selectedCount: records.length,
    unreferencedCount: artifacts.length - records.length, unindexedReferences, unmatchedUriReferences,
    workCount, workLimit: LIMITS.nodes } };
}

function resultFingerprint(result, description, run, closure) {
  return canonicalFingerprint({ version: 2, result, rule: description.rule,
    toolComponent: description.toolComponent, runReferences: closure?.references ?? referencedRunMetadata(run) });
}

function artifactCollectionDiagnostics(artifacts) {
  if (!Array.isArray(artifacts)) return undefined;
  const diagnostic = { version: 1, count: artifacts.length, limit: ARTIFACT_DIAGNOSTIC_LIMIT };
  if (artifacts.length > ARTIFACT_DIAGNOSTIC_LIMIT) return { ...diagnostic, limited: true };
  const hashes = values => ({ orderedSha256: canonicalFingerprint(values),
    sortedSha256: canonicalFingerprint(values.map(value => canonicalFingerprint(value)).sort()) });
  const locationNames = ['uri', 'uriBaseId', 'index', 'description', 'properties'];
  const locations = artifacts.map(artifact => object(artifact) && own(artifact, 'location') ? artifact.location : undefined);
  const typeCounts = values => {
    const counts = { missing: 0, null: 0, array: 0, object: 0, string: 0, number: 0, boolean: 0 };
    for (const value of values) counts[value === undefined ? 'missing' : value === null ? 'null'
      : Array.isArray(value) ? 'array' : typeof value]++;
    return counts;
  };
  const locationFields = Object.fromEntries(locationNames.map(name => [name, {
    presentCount: locations.filter(value => object(value) && own(value, name)).length,
    typeCounts: typeCounts(locations.map(value => object(value) && own(value, name) ? value[name] : undefined)),
    ...hashes(locations.map(value => object(value) ? own(value, name) ? [1, value[name]] : [0]
      : value === undefined ? [2] : [3, value]))
  }]));
  let locationRecordCount = 0, locationKeyCount = 0, selfIndexMatches = 0, nonSelfIndex = 0;
  const locationOther = locations.map((value, i) => {
    if (!object(value)) return value === undefined ? [0] : [2, value];
    if (own(value, 'index')) { if (value.index === i) selfIndexMatches++; else nonSelfIndex++; }
    const entries = Object.entries(value).filter(([name]) => !locationNames.includes(name));
    if (entries.length) locationRecordCount++;
    locationKeyCount += entries.length;
    return [1, Object.fromEntries(entries)];
  });
  const fields = {};
  for (const name of ARTIFACT_DIAGNOSTIC_FIELDS) {
    const slots = artifacts.map(artifact => object(artifact)
      ? own(artifact, name) ? [1, artifact[name]] : [0] : [2, artifact]);
    fields[name] = { presentCount: artifacts.filter(artifact => object(artifact) && own(artifact, name)).length, ...hashes(slots) };
  }
  let recordCount = 0, keyCount = 0;
  const other = artifacts.map(artifact => {
    if (!object(artifact)) return [2, artifact];
    const entries = Object.entries(artifact).filter(([name]) => !ARTIFACT_DIAGNOSTIC_FIELDS.includes(name));
    if (entries.length) recordCount++;
    keyCount += entries.length;
    return [1, Object.fromEntries(entries)];
  });
  return { ...diagnostic, ...hashes(artifacts),
    nonObjectCount: artifacts.filter(artifact => !object(artifact)).length, fields,
    location: { typeCounts: typeCounts(locations), fields: locationFields, selfIndexMatches, nonSelfIndex,
      otherFields: { recordCount: locationRecordCount, keyCount: locationKeyCount, ...hashes(locationOther) } },
    otherFields: { recordCount, keyCount, ...hashes(other) } };
}

function toolLocationDiagnostics(locations) {
  if (locations === undefined) return undefined;
  if (!Array.isArray(locations)) return { nonArray: true };
  const detail = { count: locations.length, limit: ARTIFACT_DIAGNOSTIC_LIMIT, uriLengthLimit: 4096 };
  if (locations.length > ARTIFACT_DIAGNOSTIC_LIMIT) return { ...detail, limited: true };
  Object.assign(detail, { objectCount: 0, uriCount: 0, oversizedUriCount: 0,
    schemes: { file: 0, http: 0, https: 0, relative: 0, other: 0 },
    basePresentCount: 0, indexedCount: 0, percentCount: 0, dotSegmentCount: 0, absoluteCount: 0 });
  for (const location of locations) {
    if (!object(location)) continue;
    detail.objectCount++;
    if (own(location, 'uriBaseId')) detail.basePresentCount++;
    if (own(location, 'index')) detail.indexedCount++;
    if (typeof location.uri !== 'string') continue;
    detail.uriCount++;
    if (location.uri.length > detail.uriLengthLimit) { detail.oversizedUriCount++; continue; }
    const uri = location.uri, scheme = /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1].toLowerCase();
    detail.schemes[['file', 'http', 'https'].includes(scheme) ? scheme : scheme || !uri ? 'other' : 'relative']++;
    if (uri.includes('%')) detail.percentCount++;
    if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(uri)) detail.dotSegmentCount++;
    if (scheme || uri.startsWith('/')) detail.absoluteCount++;
  }
  return detail;
}

function fingerprintDiagnostics(result, description, run, artifactDiagnostics) {
  const shape = value => ({ sha256: canonicalFingerprint(value),
    type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    ...(Array.isArray(value) || typeof value === 'string' ? { length: value.length } : {}),
    ...(object(value) ? { keys: Object.keys(value).length } : {}) });
  const components = { result, rule: description.rule, toolComponent: description.toolComponent,
    runReferences: referencedRunMetadata(run) };
  const diagnostics = { version: 1, components: {} };
  const indexReferences = value => {
    if (!value || typeof value !== 'object') return 0;
    return Object.entries(value).reduce((count, [key, child]) => count
      + (key === 'artifactLocation' && object(child) && own(child, 'index') ? 1 : 0)
      + indexReferences(child), 0);
  };
  diagnostics.artifactLocationIndexReferences = { result: indexReferences(result), rule: indexReferences(description.rule),
    toolComponent: indexReferences(description.toolComponent)
      + (Array.isArray(description.toolComponent.locations)
        ? description.toolComponent.locations.filter(value => object(value) && own(value, 'index')).length : 0) };
  for (const [component, value] of Object.entries(components)) {
    const names = FINGERPRINT_DIAGNOSTIC_FIELDS[component];
    const fields = {};
    for (const name of names) {
      if (!own(value, name) || value[name] === undefined) continue;
      fields[name] = shape(value[name]);
      if (name === 'guid' || name === 'correlationGuid') {
        fields[name].uuidFormat = typeof value[name] === 'string'
          && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value[name]);
      }
    }
    const other = Object.fromEntries(Object.entries(value).filter(([key]) => !names.includes(key)));
    // Arbitrary keys and values are never diagnostic labels; only their aggregate hash and count leave the gate.
    diagnostics.components[component] = { ...shape(value), fields, otherFields: shape(other) };
  }
  if (artifactDiagnostics) diagnostics.artifactCollection = artifactDiagnostics;
  const toolLocations = toolLocationDiagnostics(description.toolComponent.locations);
  if (toolLocations) diagnostics.toolLocations = toolLocations;
  return diagnostics;
}

const sameFile = (left, right) => left.isFile() && right.isFile()
  && ['dev', 'ino', 'size', 'mode', 'mtimeMs', 'ctimeMs'].every(field => left[field] === right[field]);

function readReviewFile(root, relativePath, maxBytes, check, allowEmpty = false, onVerified) {
  check(safeRepositoryPath(relativePath), 'path', 'CODEQL_REVIEW_INVALID');
  check(!sensitivePath(relativePath), 'sensitive-path', 'CODEQL_REVIEW_UNSAFE');
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  check(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'containment', 'CODEQL_REVIEW_INVALID');
  const verifyPath = () => {
    let current = root;
    check(fs.lstatSync(current).isDirectory() && !fs.lstatSync(current).isSymbolicLink(),
      'root-type', 'CODEQL_REVIEW_UNSAFE');
    for (const [i, part] of relativePath.split('/').entries()) {
      current = path.join(current, part);
      const stat = fs.lstatSync(current);
      check(!stat.isSymbolicLink(), 'symlink', 'CODEQL_REVIEW_UNSAFE');
      check(i === relativePath.split('/').length - 1 ? stat.isFile() : stat.isDirectory(),
        'file-type', 'CODEQL_REVIEW_UNSAFE');
    }
    check(fs.realpathSync(target) === target, 'canonical-path', 'CODEQL_REVIEW_UNSAFE');
    return fs.lstatSync(target);
  };
  const stat = verifyPath();
  check(stat.size >= (allowEmpty ? 0 : 1) && stat.size <= maxBytes, 'byte-bounds', 'CODEQL_REVIEW_LIMIT');
  const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd);
    const current = verifyPath();
    check(sameFile(opened, stat) && sameFile(opened, current), 'file-identity', 'CODEQL_REVIEW_UNSAFE');
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    const after = fs.fstatSync(fd);
    check(length === stat.size && sameFile(after, opened) && sameFile(verifyPath(), opened),
      'read-size', 'CODEQL_REVIEW_UNSAFE');
    onVerified?.(after);
    return buffer.subarray(0, length);
  } finally { fs.closeSync(fd); }
}

function applyReviews(findings, options, onTree) {
  const check = validator('review-manifest');
  const root = path.resolve(options.sourceRoot ?? path.join(__dirname, '..'));
  const manifestPath = options.reviewManifestPath;
  check(safeRepositoryPath(manifestPath) && manifestPath.startsWith('.github/') && manifestPath.endsWith('.json'),
    'manifest-path', 'CODEQL_REVIEW_INVALID');
  const buffer = readReviewFile(root, manifestPath, REVIEW_LIMITS.manifestBytes, check);
  let manifest;
  try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); }
  catch { check(false, 'json-utf8', 'CODEQL_REVIEW_INVALID'); }
  const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length
    && keys.every(key => own(value, key));
  const hasReviews = Array.isArray(manifest?.reviews) && manifest.reviews.length > 0;
  check(exactKeys(manifest, hasReviews ? ['version', 'digestAlgorithm', 'sourceTreeSha256', 'reviews']
    : ['version', 'digestAlgorithm', 'reviews']) && manifest.version === 1
    && manifest.digestAlgorithm === 'sha256-lf'
    && Array.isArray(manifest.reviews), 'schema-version', 'CODEQL_REVIEW_INVALID');
  check(manifest.reviews.length <= REVIEW_LIMITS.entries, 'entry-count', 'CODEQL_REVIEW_LIMIT');
  const tree = inspectSourceTree(root, manifestPath);
  const treeFingerprint = tree.fingerprint;
  onTree?.(treeFingerprint);
  for (const finding of findings) {
    for (const location of finding.locations) {
      if (location[SOURCE_LOCATION] && safeSourcePath(location.path) && tree.sources.has(location.path)) {
        location.sourceSha256 = tree.sources.get(location.path).sha256;
      }
    }
    if (finding.locations.length === 1 && finding.locations[0].sourceSha256) {
      finding.sourceSha256 = finding.locations[0].sourceSha256;
    }
  }
  if (hasReviews) {
    check(typeof manifest.sourceTreeSha256 === 'string' && /^[a-f0-9]{64}$/.test(manifest.sourceTreeSha256),
      'source-tree-fingerprint', 'CODEQL_REVIEW_INVALID');
    check(treeFingerprint === manifest.sourceTreeSha256, 'source-tree-fingerprint', 'CODEQL_REVIEW_STALE');
  }
  const entries = new Map();
  const sources = new Map();
  const sourcePaths = new Set(findings.flatMap(finding => finding.locations
    .filter(location => location[SOURCE_LOCATION] && safeSourcePath(location.path)).map(location => location.path)));
  let totalBytes = 0;
  const key = (ruleId, filename, line, fingerprint) => JSON.stringify([ruleId, filename, line, fingerprint]);
  for (const [entryIndex, entry] of manifest.reviews.entries()) {
    const check = validator('review-manifest', { entry: entryIndex });
    check(exactKeys(entry, ['ruleId', 'path', 'startLine', 'sourceSha256', 'resultFingerprint', 'maxOccurrences', 'reviewer', 'reason', 'evidence']),
      'entry-schema', 'CODEQL_REVIEW_INVALID');
    check(text(entry.ruleId) && safeRuleId(entry.ruleId) === entry.ruleId && safeSourcePath(entry.path)
      && index(entry.startLine) && entry.startLine > 0
      && index(entry.maxOccurrences) && entry.maxOccurrences > 0 && entry.maxOccurrences <= LIMITS.results
      && typeof entry.resultFingerprint === 'string' && /^[a-f0-9]{64}$/.test(entry.resultFingerprint)
      && typeof entry.sourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sourceSha256),
    'entry-identity', 'CODEQL_REVIEW_INVALID');
    for (const field of ['reviewer', 'reason', 'evidence']) {
      check(typeof entry[field] === 'string' && entry[field].trim().length > 0
        && entry[field].length <= (field === 'reviewer' ? 200 : 4096), 'review-metadata', 'CODEQL_REVIEW_INVALID');
    }
    const identity = key(entry.ruleId, entry.path, entry.startLine, entry.resultFingerprint);
    check(!entries.has(identity), 'duplicate-entry', 'CODEQL_REVIEW_INVALID');
    check(sourcePaths.has(entry.path), 'source-location', 'CODEQL_REVIEW_STALE');
    if (!sources.has(entry.path)) {
      check(sources.size < REVIEW_LIMITS.sourceFiles, 'source-count', 'CODEQL_REVIEW_LIMIT');
      check(tree.sources.has(entry.path), 'tracked-source', 'CODEQL_REVIEW_UNSAFE');
      const source = tree.sources.get(entry.path);
      totalBytes += source.bytes;
      check(totalBytes <= REVIEW_LIMITS.totalSourceBytes, 'source-byte-bounds', 'CODEQL_REVIEW_LIMIT');
      sources.set(entry.path, source.sha256);
    }
    check(sources.get(entry.path) === entry.sourceSha256, 'source-fingerprint', 'CODEQL_REVIEW_STALE');
    entries.set(identity, entry);
  }
  const occurrences = new Map();
  for (const finding of findings) {
    for (const identity of new Set(finding.locations.map(location => key(finding.ruleId, location.path, location.line, finding.resultFingerprint)))) {
      occurrences.set(identity, (occurrences.get(identity) ?? 0) + 1);
    }
  }
  // Over-capacity identities approve no result: scan ordering must not choose which distinct flow inherits a review.
  for (const finding of findings) {
    finding.reviewed = finding[REVIEWABLE_LOCATIONS] && finding.locations.every(location => {
      const identity = key(finding.ruleId, location.path, location.line, finding.resultFingerprint);
      return entries.has(identity) && occurrences.get(identity) <= entries.get(identity).maxOccurrences;
    });
  }
  return { reviewed: findings.filter(finding => finding.reviewed).length, sourceTreeFingerprint: treeFingerprint };
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
  const safePath = safeRepositoryPath(uri);
  const region = physical.region;
  if (region !== undefined) {
    check(object(region), 'region');
    for (const key of ['startLine', 'startColumn', 'endLine', 'endColumn']) {
      if (own(region, key)) check(index(region[key]) && region[key] > 0, key);
    }
  }
  if (!safePath) return null;
  const result = { path: uri, line: region?.startLine ?? null };
  Object.defineProperty(result, SOURCE_LOCATION,
    { value: !own(artifact, 'uriBaseId') || artifact.uriBaseId === '%SRCROOT%' });
  return result;
}

function inspectReport(report, reportIndex, diagnosticBudget = { remaining: FINGERPRINT_DIAGNOSTIC_LIMIT }) {
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
    const artifactClosureCache = {};
    let artifactDiagnosticCache;
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
      let closure, closureFailure;
      try { closure = referencedArtifactClosure(result, description, run, artifactClosureCache); }
      catch (error) {
        if (error.errorCode !== 'CODEQL_ARTIFACT_CLOSURE_INVALID') throw error;
        closureFailure = error.diagnostic.field;
      }
      const finding = { report: reportIndex, run: runIndex, result: resultIndex,
        ruleId: safeRuleId(description.rule.id), level, securitySeverity: description.severity,
        locations: safeLocations, resultFingerprint: resultFingerprint(result, description, run, closure),
        artifactClosure: closure?.diagnostics ?? { version: 2, eligible: false, failure: closureFailure } };
      if (diagnosticBudget.remaining > 0) {
        diagnosticBudget.remaining--;
        artifactDiagnosticCache ??= artifactCollectionDiagnostics(run.artifacts);
        finding.fingerprintDiagnostics = fingerprintDiagnostics(result, description, run, artifactDiagnosticCache);
      }
      Object.defineProperty(finding, REVIEWABLE_LOCATIONS, { value: !!closure && locations.length > 0 && locations.length === safeLocations.length
        && safeLocations.every(location => location[SOURCE_LOCATION] && location.line !== null
          && safeSourcePath(location.path)) });
      findings.push(finding);
    }
  }
  return { runs: report.runs.length, results: resultCount, levels, findings };
}

function auditDirectory(directory, analysisOutcome, options = {}) {
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
    const diagnosticBudget = { remaining: FINGERPRINT_DIAGNOSTIC_LIMIT };
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
      const inspected = inspectReport(report, reportIndex, diagnosticBudget);
      totals.runs += inspected.runs;
      totals.results += inspected.results;
      check(totals.results <= LIMITS.results, 'result-count', 'CODEQL_SARIF_LIMIT');
      for (const level of LEVELS) totals.levels[level] += inspected.levels[level];
      for (const finding of inspected.findings) findings.push(finding);
    }
    totals.securityFindings = findings.length;
    const fingerprintDiagnosticCounts = findings.length ? { fingerprintDiagnosticCounts: {
      emitted: FINGERPRINT_DIAGNOSTIC_LIMIT - diagnosticBudget.remaining, limit: FINGERPRINT_DIAGNOSTIC_LIMIT } } : {};
    const executionVerified = analysisOutcome === 'success';
    let blockingFindings = findings.length;
    let treeFingerprint;
    if (options.reviewManifestPath !== undefined) {
      totals.reviewedFindings = 0;
      totals.unreviewedFindings = findings.length;
      for (const finding of findings) finding.reviewed = false;
      try {
        const reviews = applyReviews(findings, options, fingerprint => { treeFingerprint = fingerprint; });
        totals.reviewedFindings = reviews.reviewed;
        treeFingerprint = reviews.sourceTreeFingerprint;
        blockingFindings = totals.unreviewedFindings = findings.length - totals.reviewedFindings;
      } catch (error) {
        return { ok: false, errorCode: error.errorCode ?? 'CODEQL_REVIEW_UNAVAILABLE',
          diagnostic: error.diagnostic ?? { stage: 'review-manifest', field: 'file-access' }, totals, findings,
          ...fingerprintDiagnosticCounts,
          ...(treeFingerprint ? { sourceTreeFingerprint: treeFingerprint } : {}) };
      }
    }
    const ok = executionVerified && blockingFindings === 0;
    return { ok, ...(!executionVerified ? { errorCode: 'CODEQL_ANALYSIS_UNSUCCESSFUL' }
      : blockingFindings ? { errorCode: 'CODEQL_SECURITY_FINDINGS' } : {}), totals, findings,
      ...fingerprintDiagnosticCounts,
      ...(treeFingerprint ? { sourceTreeFingerprint: treeFingerprint } : {}) };
  } catch (error) {
    return { ok: false, errorCode: error.errorCode ?? 'CODEQL_SARIF_UNAVAILABLE',
      diagnostic: error.diagnostic ?? { stage: 'report-files', field: 'file-access', ...context } };
  }
}

function main() {
  const args = process.argv.slice(2);
  const result = args.length > 1 ? { ok: false, errorCode: 'CODEQL_GATE_ARGUMENTS_INVALID' }
    : auditDirectory(args[0] ?? process.env.CODEQL_SARIF_DIRECTORY, process.env.CODEQL_ANALYSIS_OUTCOME,
      { reviewManifestPath: process.env.CODEQL_REVIEW_MANIFEST });
  const { findings, ...summary } = result;
  console.log(JSON.stringify({ mode: 'conversation-codeql-gate', privacy: 'aggregate-only', ...summary }));
  // All findings remain retrievable in job logs without uploading raw, source-bearing SARIF artifacts.
  for (const finding of findings ?? []) console.log(JSON.stringify({ mode: 'codeql-finding-location', ...finding }));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { auditDirectory, inspectReport, LIMITS, REVIEW_LIMITS, sourceFingerprint, sourceTreeFingerprint, isKnownTextPath };
