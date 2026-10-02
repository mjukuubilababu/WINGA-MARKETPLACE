const path = require('node:path');
require('esbuild').buildSync({ entryPoints: [path.join(__dirname, 'client.mjs')], outfile: path.join(__dirname, 'dist/client.js'), bundle: true, platform: 'browser', target: ['es2022'], format: 'iife', sourcemap: false });
