const {spawn} = require('node:child_process');
const {setTimeout: pause} = require('node:timers/promises');

function transientFailure(output = '') {
  if (/\b(?:401|403)\b|authentication error|invalid.*(?:token|credential)|permission denied|forbidden/i.test(output)) return false;
  return /(?:->\s*|\bHTTP(?:\/[0-9.]+)?\s+|\bstatus(?: code)?\s*[:=]?\s*)(?:429|500|502|503|504)\b|gateway timeout|service unavailable|internal server error|bad gateway|too many requests|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed|received a malformed response from the API/i.test(output);
}

function runWrangler(args, write) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', 'wrangler@4.149.0', ...args], {stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    const receive = chunk => {
      write(chunk);
      output = (output + chunk.toString()).slice(-65536);
    };
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.on('error', reject);
    child.on('close', code => resolve({code: code ?? 1, output}));
  });
}

async function deployWorker(args, {run = runWrangler, wait = pause, write = chunk => process.stdout.write(chunk)} = {}) {
  if (!Array.isArray(args) || args[0] !== 'deploy' || !args.includes('--keep-vars')) throw new Error('Expected a Worker deploy with --keep-vars.');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await run(args, write);
    if (result.code === 0) return 0;
    if (attempt === 3 || !transientFailure(result.output)) return result.code || 1;
    const delay = attempt === 1 ? 5000 : 15000;
    write(`Cloudflare transient deployment failure; retrying this Worker in ${delay / 1000}s (${attempt}/3).\n`);
    await wait(delay);
  }
  return 1;
}

module.exports = {deployWorker, transientFailure};
if (require.main === module) deployWorker(process.argv.slice(2)).then(code => {
  process.exitCode = code;
}).catch(error => {
  process.stderr.write(`Worker deployment failed: ${error.message}\n`);
  process.exitCode = 1;
});
