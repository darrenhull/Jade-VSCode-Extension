'use strict';
const path=require('node:path');
try { console.log(JSON.stringify(require('./ReleasePlan.cjs').create(path.resolve(__dirname,'..'),process.argv[2]||''))); }
catch(error) { console.error(error.message);process.exitCode=1; }
