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
// Change Seat: the session moves to seat 4 (extra chips 0) and back; the same start time and buy-in are kept.
{const start=tables[0].seats[0].sessionStart;const answers=['4','0','T1 1','0'];window.prompt=()=>answers.shift();
await act(async()=>{button('⇄ 換位').props.onClick();await flush()});assert.equal(tables[0].seats[0].status,'idle');assert.equal(tables[0].seats[3].memberId,'Alice');assert.equal(tables[0].seats[3].buyInAmount,2500);assert.equal(tables[0].seats[3].sessionStart,start);
await act(async()=>{button('⇄ 換位').props.onClick();await flush()});assert.equal(tables[0].seats[3].status,'idle');assert.equal(tables[0].seats[0].memberId,'Alice');assert.equal(tables[0].seats[0].status,'seated');
window.prompt=()=>{prompts++;return '2500'};}
const cashForm=()=>app.root.findAllByType('form').find(f=>f.props.className==='cash-dialog');
await act(async()=>button('下桌').props.onClick());assert.ok(cashForm(),'leave opens the cash-out dialog');
await act(async()=>button('取消').props.onClick());assert.ok(!cashForm());assert.equal(tables[0].seats[0].status,'seated','cancel keeps the player seated');
await act(async()=>button('下桌').props.onClick());
const beforeCash=writes;await act(async()=>{cashForm().props.onSubmit({preventDefault(){}});await flush()});assert.equal(writes,beforeCash,'no amount, no leave');assert.ok(cashForm());
const cashInput=()=>app.root.findAllByType('input').find(i=>i.props.className==='cash-input');
await act(async()=>cashInput().props.onChange({target:{value:'4,000'}}));
await act(async()=>{cashForm().props.onSubmit({preventDefault(){}});await flush()});
assert.equal(tables[0].seats[0].status,'idle');assert.equal(tables[0].sessions[0].buyInAmount,2500);assert.equal(tables[0].sessions[0].cashOutAmount,4000);assert.equal(tables[0].sessions[0].busted,false);assert.equal(input().props.value,'');
// Busted records 0.
await act(async()=>input().props.onChange({target:{value:'Bob'}}));await act(async()=>{button('上桌').props.onClick();await flush()});
await act(async()=>button('下桌').props.onClick());await act(async()=>app.root.findAllByType('button').find(b=>b.props.className&&b.props.className.startsWith('cash-busted')).props.onClick());
await act(async()=>{cashForm().props.onSubmit({preventDefault(){}});await flush()});
assert.equal(tables[0].sessions[1].cashOutAmount,0);assert.equal(tables[0].sessions[1].busted,true);
app.unmount();console.log('PASS: name draft, one-click seat, buy-in, timer, polling race, cancel leave, cash-out on leave, busted, session record');})().catch(e=>{console.error(e);process.exit(1)});
