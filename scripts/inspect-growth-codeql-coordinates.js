const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const expected = require('./codeql-growth-coordinate-input.json');
const { auditDirectory, sourceFingerprint } = require('./check-conversation-codeql');

function fail() { throw new Error('COORDINATE_PROOF_REJECTED'); }
function check(value) { if (!value) fail(); }
function git(...args) { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 20000000 }); }
const digest = value => {
  const sort = x => Array.isArray(x) ? x.map(sort) : x && typeof x === 'object'
    ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sort(x[k])])) : x;
  return crypto.createHash('sha256').update(JSON.stringify(sort(value))).digest('hex');
};
const lines = value => value.replace(/\r\n/g, '\n').split('\n');
const mappings = new Map();
function sourceMap(file) {
  if (mappings.has(file)) return mappings.get(file);
  check(/^[A-Za-z0-9._/-]+$/.test(file) && !file.split('/').includes('..'));
  const before = lines(git('show', expected.prior + ':' + file));
  const after = lines(git('show', expected.candidate + ':' + file));
  check(lines(fs.readFileSync(file, 'utf8')).join('\n') === after.join('\n'));
  const diff = git('diff', '--no-ext-diff', '--unified=0', expected.prior, expected.candidate, '--', file);
  check(!/^(new file|deleted file|rename |similarity index|Binary files)/m.test(diff));
  const segments = [];
  let oldCursor = 1, newCursor = 1;
  const append = length => {
    check(Number.isSafeInteger(length) && length >= 0);
    for (let j = 0; j < length; j++) check(before[oldCursor - 1 + j] === after[newCursor - 1 + j]);
    if (length) segments.push({ start: newCursor, end: newCursor + length - 1, oldStart: oldCursor });
    oldCursor += length; newCursor += length;
  };
  for (const match of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const oldCount = match[2] === undefined ? 1 : Number(match[2]);
    const newCount = match[4] === undefined ? 1 : Number(match[4]);
    const oldStart = Number(match[1]) + (oldCount === 0 ? 1 : 0);
    const newStart = Number(match[3]) + (newCount === 0 ? 1 : 0);
    check(oldStart - oldCursor === newStart - newCursor);
    append(newStart - newCursor);
    oldCursor = oldStart + oldCount; newCursor = newStart + newCount;
  }
  check(before.length - oldCursor === after.length - newCursor);
  append(after.length - newCursor + 1);
  const result = { before, after, segments };
  mappings.set(file, result); return result;
}
function uri(value, base) {
  check(typeof value === 'string' && value.length <= 4096 && value.length > 0);
  check(base === undefined || base === '%SRCROOT%');
  check(!/[\\%?#:]/.test(value) && !value.startsWith('/') && !value.split('/').some(x => !x || x === '.' || x === '..'));
  check(/^[A-Za-z0-9._/-]+$/.test(value));
  return value;
}
function resolve(location, run) {
  check(location && typeof location === 'object' && !Array.isArray(location));
  let direct, indexed;
  if (Object.hasOwn(location, 'uri')) direct = uri(location.uri, location.uriBaseId);
  if (Object.hasOwn(location, 'index')) {
    check(Number.isSafeInteger(location.index) && location.index >= 0 && location.index < run.artifacts.length);
    const target = run.artifacts[location.index]?.location;
    check(target && typeof target === 'object');
    indexed = uri(target.uri, target.uriBaseId);
  }
  check(direct || indexed); check(!direct || !indexed || direct === indexed);
  return direct || indexed;
}
function translate(value, run, field) {
  const copy = JSON.parse(JSON.stringify(value));
  let translated = 0, locations = 0, visits = 0;
  const translateLocation = node => {
    check(++visits <= 100000 && node && typeof node === 'object' && !Array.isArray(node));
    if (Object.hasOwn(node, 'physicalLocation')) {
      const physical = node.physicalLocation;
      check(physical && typeof physical === 'object' && !Array.isArray(physical));
      const file = resolve(physical.artifactLocation, run);
      const mapping = sourceMap(file), region = physical.region;
      if (region !== undefined) {
        check(region && typeof region === 'object' && !Array.isArray(region));
        if (Object.hasOwn(region, 'startLine')) {
          const start = region.startLine, end = Object.hasOwn(region, 'endLine') ? region.endLine : start;
          check(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && end >= start && end <= mapping.after.length);
          const segments = mapping.segments.filter(s => start >= s.start && end <= s.end);
          check(segments.length === 1); const segment = segments[0];
          const shift = segment.oldStart - segment.start;
          region.startLine = start + shift;
          if (Object.hasOwn(region, 'endLine')) region.endLine = end + shift;
          locations++; if (shift) translated++;
        } else check(!Object.hasOwn(region, 'endLine'));
      }
    }
  };
  check(Array.isArray(copy));
  if (field === 'locations' || field === 'relatedLocations') copy.forEach(translateLocation);
  else if (field === 'codeFlows') {
    for (const flow of copy) {
      check(flow && Array.isArray(flow.threadFlows));
      for (const thread of flow.threadFlows) {
        check(thread && Array.isArray(thread.locations));
        for (const entry of thread.locations) translateLocation(entry.location);
      }
    }
  } else fail();
  return { value: copy, translated, locations };
}
function main() {
  const directory = process.env.CODEQL_SARIF_DIRECTORY;
  const audit = auditDirectory(directory, process.env.CODEQL_ANALYSIS_OUTCOME);
  check(process.env.CODEQL_ANALYSIS_OUTCOME === 'success' && audit.findings?.length === expected.findings.length);
  const reports = fs.readdirSync(directory).filter(x => x.toLowerCase().endsWith('.sarif')).sort().map(file => {
    const fd = fs.openSync(path.join(directory, file), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const stat = fs.fstatSync(fd); check(stat.isFile() && stat.size > 0 && stat.size < 64000000);
      return JSON.parse(fs.readFileSync(fd, 'utf8'));
    } finally { fs.closeSync(fd); }
  });
  const seen = new Set(), output = [];
  for (const finding of audit.findings) {
    check(finding.locations.length === 1);
    const site = finding.locations[0];
    const matches = expected.findings.filter(x => x.rule === finding.ruleId && x.path === site.path && x.line === site.line);
    check(matches.length === 1); const item = matches[0];
    const identity = item.rule + '|' + item.path + '|' + item.line;
    check(!seen.has(identity)); seen.add(identity);
    check(sourceFingerprint(fs.readFileSync(item.path)) === item.source
      && sourceFingerprint(Buffer.from(git('show', expected.candidate + ':' + item.path), 'utf8')) === item.source
      && finding.resultFingerprint === item.fingerprint && finding.artifactClosure?.sha256 === item.closure);
    const run = reports[finding.report].runs[finding.run], result = run.results[finding.result];
    check(result.ruleId === item.rule);
    for (const [field, hashes] of Object.entries(item.fields)) {
      check(['locations', 'relatedLocations', 'codeFlows'].includes(field) && Object.hasOwn(result, field));
      check(digest(result[field]) === hashes.current);
      const proof = translate(result[field], run, field);
      check(digest(proof.value) === hashes.prior);
      output.push({ rule: item.rule, path: item.path, line: item.line, field, currentHash: hashes.current,
        translatedHash: digest(proof.value), priorHash: hashes.prior, locations: proof.locations, translated: proof.translated });
    }
  }
  check(seen.size === expected.findings.length && output.length > 0);
  console.log(JSON.stringify({ mode: 'growth-codeql-coordinate-proof', ok: true, candidate: expected.candidate,
    prior: expected.prior, candidateRun: expected.candidateRun, priorRun: expected.priorRun,
    diagnostic: git('rev-parse', 'HEAD').trim(), findings: seen.size, comparedFields: output.length, mappings: mappings.size }));
  for (const proof of output) console.log(JSON.stringify({ mode: 'growth-codeql-coordinate-field', ...proof }));
}
try { main(); } catch { console.log(JSON.stringify({ mode: 'growth-codeql-coordinate-proof', ok: false,
  errorCode: 'COORDINATE_PROOF_REJECTED' })); process.exitCode = 1; }
