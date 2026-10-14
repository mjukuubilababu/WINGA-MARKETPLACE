const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const os = require("node:os");

for(const filename of ['tmp-bootstrap-integrity-check.mjs','tmp-image-viewport-check.mjs','tests/e2e/start-servers.js']){
  test(filename+' keeps encoded sibling-directory traversal outside the static root',async()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'winga-static-boundary-'));
    const root=path.join(directory,'root'),neighbor=path.join(directory,'root-neighbor');
    fs.mkdirSync(root);fs.mkdirSync(neighbor);fs.writeFileSync(path.join(root,'inside.txt'),'inside');
    fs.writeFileSync(path.join(neighbor,'sentinel.txt'),'outside-synthetic');
    const source=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
    const start=source.indexOf('function createStaticServer()'),end=source.indexOf('\n}',start)+2;
    const handler=vm.runInNewContext(source.slice(start,end)+'\ncreateStaticServer()',{
      URL,Buffer,path,process:{env:{}},STATIC_ROOT:root,rootDir:root,frontendPort:4173,FRONTEND_URL:'http://127.0.0.1:4173',
      fs:fs.promises,fsp:fs.promises,getContentType:()=> 'text/plain',http:{createServer:callback=>callback}
    });
    const request=async url=>{let status,body;await handler({url,method:'GET',headers:{}},{writeHead:value=>{status=value;},end:value=>{body=value;}});return {status,body:String(body)};};
    try{
      assert.deepEqual(await request('/inside.txt'),{status:200,body:'inside'});
      const outside=await request('/..%2froot-neighbor%2fsentinel.txt');
      assert.equal(outside.status,403);assert.equal(outside.body.includes('outside-synthetic'),false);
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
  });
}

for (const filename of ["tmp-bootstrap-integrity-check.mjs", "tmp-image-viewport-check.mjs"]) {
  test(filename + " cannot follow an upstream redirect or replace the loopback authority", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
    const start = source.indexOf("function createStaticServer()"), end = source.indexOf("\n}", start) + 2;
    assert.ok(start >= 0 && end > start);
    const calls = [];
    const handler = vm.runInNewContext(source.slice(start, end) + "\ncreateStaticServer()", {
      URL, FRONTEND_URL: "http://127.0.0.1:4173", BACKEND_URL: "http://127.0.0.1:43080/api",
      BACKEND_ORIGIN: "http://127.0.0.1:43080", BACKEND_API: "http://127.0.0.1:43080/api",
      http: { createServer: (callback) => callback },
      fetch: async (url, options) => {
        calls.push({ url, options });
        if (options.redirect !== "error") throw new Error("Redirect policy missing");
        throw new TypeError("Synthetic upstream redirect rejected");
      }
    });
    for (const url of ["/api/redirect?next=https://synthetic.invalid/private", "https://synthetic.invalid/api/redirect", "/uploads/redirect"]) {
      let status, ended;
      await handler({ url, method: "GET", headers: { cookie: "synthetic-cookie" } }, {
        writeHead: (value) => { status = value; }, end: (value) => { ended = value; }
      });
      assert.equal(status, 404);
      assert.equal(ended, "Not Found");
    }
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(new URL(call.url).origin, "http://127.0.0.1:43080");
      assert.equal(call.options.redirect, "error");
    }
  });
}
