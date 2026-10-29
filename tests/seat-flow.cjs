const assert=require('node:assert/strict');
require('esbuild').buildSync({entryPoints:['src/App.tsx'],bundle:true,platform:'node',format:'cjs',outfile:'/tmp/ppm-app-test.cjs',external:['react'],define:{'import.meta.env':'{}'}});
// Resolve React from this project even when the bundle is in /tmp.
const Module=require('module');process.env.NODE_PATH=process.cwd()+'/node_modules';Module._initPaths();
const React=require('react'),{create,act}=require('react-test-renderer');
const mem=new Map([['ppm-session','test']]);global.sessionStorage={getItem:k=>mem.get(k),setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};
let poll,resolveRead,delay=false,version=0,tables=[],writes=0,prompts=0,confirmation=true;
global.window={setInterval:f=>{if(!poll)poll=f;return 1},clearInterval(){},prompt(){prompts++;return '2500'},confirm(){return confirmation},alert:m=>{throw Error(m)}};
global.fetch=async(url,opts={})=>{if(url.endsWith('/state'))return {ok:true,json:async()=>({version:0,state:{queue:[],counters:{'50 / 100 NLH':1},calls:{}}})};if(opts.method==='PUT'){writes++;const b=JSON.parse(opts.body);assert.equal(b.version,version);tables=b.tables;return {ok:true,json:async()=>({version:++version,tables})}}if(delay)await new Promise(r=>resolveRead=r);return {ok:true,json:async()=>({version,tables})}};
const App=require('/tmp/ppm-app-test.cjs').default;
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{let app;await act(async()=>{app=create(React.createElement(App));await flush()});const button=text=>app.root.findAllByType('button').find(b=>b.children.join('')===text);
await act(async()=>{button('開桌 / 繼續').props.onClick();await flush()});
const input=()=>app.root.findAllByType('input').find(i=>i.props.className==='member-input');
const before=writes;await act(async()=>input().props.onChange({target:{value:'Alice'}}));assert.equal(writes,before,'typing must not save');
// An action during the background read must wait and then save exactly once.
delay=true;await act(async()=>{poll();await flush()});await act(async()=>{button('上桌').props.onClick();await flush()});assert.equal(writes,before);delay=false;await act(async()=>{resolveRead();await flush()});assert.equal(writes,before+1);assert.equal(prompts,1);assert.equal(tables[0].seats[0].memberId,'Alice');assert.equal(tables[0].seats[0].buyInAmount,2500);assert.equal(tables[0].seats[0].status,'seated');assert.ok(tables[0].seats[0].lastActiveStart);
confirmation=false;await act(async()=>button('下桌').props.onClick());assert.equal(tables[0].seats[0].status,'seated');confirmation=true;await act(async()=>{button('下桌').props.onClick();await flush()});assert.equal(tables[0].seats[0].status,'idle');assert.equal(tables[0].sessions[0].buyInAmount,2500);assert.equal(input().props.value,'');app.unmount();console.log('PASS: name draft, one-click seat, buy-in, timer, polling race, cancel leave, confirmed leave and session record');})().catch(e=>{console.error(e);process.exit(1)});
