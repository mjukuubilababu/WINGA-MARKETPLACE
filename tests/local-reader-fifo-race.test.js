const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..');
for(const mode of ['stable','legacy','backup'])test(`${mode} reader rejects a regular-file-to-FIFO swap without waiting for a writer`,t=>{
  if(process.platform==='win32'||!fs.constants.O_NONBLOCK){t.skip('POSIX FIFO fixture required');return;}
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'winga-reader-fifo-')),filename=path.join(directory,'fixture.webp');
  fs.writeFileSync(filename,'abc');
  const script=`
    const fs=require('node:fs'),{execFileSync}=require('node:child_process');
    const [file,dir,mode,repo]=process.argv.slice(1),open=fs.promises.open;let closed=0;
    fs.promises.open=async(...args)=>{
      fs.unlinkSync(file);execFileSync('mkfifo',[file]);
      const handle=await open(...args),close=handle.close.bind(handle);
      handle.close=async()=>{closed++;return close();};return handle;
    };
    const work=mode==='stable'?()=>require(repo+'/backend/stable-local-file').readStableLocalFile(file,{maxBytes:3})
      :mode==='legacy'?()=>require(repo+'/backend/legacy-public-media').readLegacyLocalMedia(dir,'fixture.webp')
      :()=>require(repo+'/backend/backup-legacy-private-media').readStableFile(dir,'fixture.webp',3);
    work().then(value=>{if(value!==null)throw Error('Unexpected file acceptance');console.log(JSON.stringify({rejected:true,closed}));})
      .catch(error=>{if(!['LOCAL_FILE_CHANGED','BACKUP_SOURCE_CHANGED_OR_UNSUPPORTED'].includes(error.message)){process.exitCode=1;return;}
        console.log(JSON.stringify({rejected:true,closed}));});
  `;
  try{
    // Broken readers hang inside open; isolate and forcibly bound this regression.
    const result=spawnSync(process.execPath,['-e',script,filename,directory,mode,repo],{encoding:'utf8',timeout:2500,killSignal:'SIGKILL'});
    assert.equal(result.error,undefined,result.error?.code);assert.equal(result.status,0);
    assert.deepEqual(JSON.parse(result.stdout.trim()),{rejected:true,closed:1});
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
