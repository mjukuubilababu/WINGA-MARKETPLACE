function releaseHeaders(env=process.env) {
  const commit=env.RENDER_GIT_COMMIT;
  return typeof commit==='string'&&/^[a-f0-9]{40}$/.test(commit)?{'X-Winga-Commit':commit}:{};
}
module.exports={releaseHeaders};
