const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'docs/winga-growth-readiness.json');
const statuses = new Set(['source_prepared','blocked','needs_hardening','observation_pending','validation_deferred','conditional','accepted']);
function inspect() {
  const report = JSON.parse(fs.readFileSync(source, 'utf8'));
  if (report.schemaVersion !== 1 || !Array.isArray(report.workItems) || !Array.isArray(report.requirements)) throw Error('readiness_schema_invalid');
  const ids = new Set(report.workItems.map(item => item.id));
  if (ids.size !== report.workItems.length || report.requirements.length !== 106) throw Error('readiness_coverage_invalid');
  const sections = new Set(report.requirements.map(item => item.section));
  for (let section = 1; section <= 106; section++) if (!sections.has(section)) throw Error('readiness_coverage_invalid');
  for (const item of report.workItems) {
    if (!/^[A-Z]+-\d{2}$/.test(item.id) || !statuses.has(item.status) || !item.evidence || !item.nextAction || !Array.isArray(item.sources) || !item.sources.length || !Array.isArray(item.dependsOn)) throw Error('readiness_work_invalid');
    for (const dependency of item.dependsOn) if (!ids.has(dependency) || dependency === item.id) throw Error('readiness_dependency_invalid');
    for (const file of item.sources) {
      if (typeof file !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(file) || file.startsWith('/') || file.split('/').includes('..') || !fs.existsSync(path.join(root, file))) throw Error('readiness_reference_invalid');
    }
  }
  const workById = new Map(report.workItems.map(item => [item.id,item]));
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw Error('readiness_dependency_invalid');
    if (visited.has(id)) return;
    visiting.add(id);for (const dependency of workById.get(id).dependsOn) visit(dependency);
    visiting.delete(id);visited.add(id);
  }
  for (const item of report.workItems) {
    if (!Array.isArray(item.specSections) || item.specSections.some(section => !Number.isInteger(section) || section < 1 || section > 106)) throw Error('readiness_requirement_invalid');
    visit(item.id);
    if (item.status === 'accepted' && item.dependsOn.some(id => !['accepted','conditional'].includes(workById.get(id).status))) throw Error('readiness_acceptance_conflict');
  }
  for (const requirement of report.requirements) {
    if (!requirement.baselineEvidence || !Array.isArray(requirement.workItems) || requirement.workItems.some(id => !ids.has(id))) throw Error('readiness_requirement_invalid');
  }
  if(report.phases!==undefined){
    if(!Array.isArray(report.phases)||new Set(report.phases.map(phase=>phase.id)).size!==report.phases.length)throw Error('readiness_schema_invalid');
    for(const phase of report.phases){
      if(!Number.isInteger(phase.id)||phase.id<1||phase.id>4||!['source_prepared','implementation_completed'].includes(phase.sourceStatus)||!['blocked','observation_pending','accepted'].includes(phase.acceptanceStatus)||!Array.isArray(phase.acceptanceDependsOn)||phase.acceptanceDependsOn.some(id=>!ids.has(id)))throw Error('readiness_schema_invalid');
      if(phase.acceptanceStatus==='accepted'&&phase.acceptanceDependsOn.some(id=>workById.get(id).status!=='accepted'))throw Error('readiness_acceptance_conflict');
    }
  }
  const blocking = report.workItems.filter(item => !['accepted','conditional','source_prepared'].includes(item.status));
  if (report.overall?.productionReady === true && (blocking.length || report.overall.messages !== 'accepted' || report.overall.independentSecurityReview !== 'accepted')) throw Error('readiness_acceptance_conflict');
  return {report,blocking};
}
try {
  if (process.argv.some(arg => !['--verify','--help'].includes(arg) && process.argv.indexOf(arg) > 1)) throw Error('readiness_arguments_invalid');
  if (process.argv.includes('--help')) {
    console.log('node scripts/growth-readiness.js [--verify]\nReads the repository ledger only. No network, messages, canary or replay.');
  } else {
    const {report,blocking} = inspect();
    if (process.argv.includes('--verify')) console.log('Readiness ledger valid: all 106 sections covered; source links and dependency IDs exist. This is not runtime or production acceptance.');
    else {
      console.log(`Winga Growth Loops — ${report.updatedAt}\nSource baseline: ${report.sourceBaseline}\nProduction ready: ${report.overall.productionReady}\nMessages: ${report.overall.messages}\nSpecification coverage: 106 sections (coverage is not a pass count)\nOpen acceptance/hardening work items: ${blocking.length}\n`);
      for(const phase of report.phases||[])console.log(`Phase ${phase.id}: source ${phase.sourceStatus}; acceptance ${phase.acceptanceStatus}`);
      for (const item of report.workItems) console.log(`${item.id} [${item.priority}] ${item.status}: ${item.title}`);
      console.log('\nResume: docs/winga-growth-status.md\nOperations/security: docs/growth-operations-handoff.md');
    }
  }
} catch (error) {
  console.error(['readiness_schema_invalid','readiness_coverage_invalid','readiness_work_invalid','readiness_dependency_invalid','readiness_reference_invalid','readiness_requirement_invalid','readiness_acceptance_conflict','readiness_arguments_invalid'].includes(error.message) ? error.message : 'readiness_report_unavailable');
  process.exitCode = 1;
}
