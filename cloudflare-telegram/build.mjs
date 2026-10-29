import { readFileSync,writeFileSync } from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const bundled=read('rules.mjs')+'\n'+read('schema.mjs')+'\n'+read('worker.mjs').replace(/^import .*;\n/gm,'');
writeFileSync(new URL('dashboard-worker.mjs',import.meta.url),bundled);
console.log('Created dashboard-worker.mjs');
