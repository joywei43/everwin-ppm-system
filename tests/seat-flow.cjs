const assert=require('node:assert/strict');
require('esbuild').buildSync({entryPoints:['src/App.tsx'],bundle:true,platform:'node',format:'cjs',outfile:'/tmp/ppm-app-test.cjs',external:['react'],define:{'import.meta.env':'{}'}});
// Resolve React from this project even when the bundle is in /tmp.
const Module=require('module');process.env.NODE_PATH=process.cwd()+'/node_modules';Module._initPaths();
const React=require('react'),{create,act}=require('react-test-renderer');
const mem=new Map([['ppm-session','test'],['ppm-user','Phoebe']]);global.sessionStorage={getItem:k=>mem.get(k),setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};
let poll,resolveRead,delay=false,version=0,tables=[],writes=0,confirmation=true,waiting=[],seatCalls=[];
global.window={setInterval:f=>{if(!poll)poll=f;return 1},clearInterval(){},prompt(){return ''},confirm(){return confirmation},alert:m=>{throw Error(m)}};
const ok=d=>({ok:true,status:200,json:async()=>d});
global.fetch=async(url,opts={})=>{
 if(/\/members\/|\/sessions\//.test(url))return {ok:false,json:async()=>({})};
 if(url.endsWith('/state'))return ok({version:0,state:{queue:[],counters:{'50 / 100 NLH':1},calls:{}}});
 if(url.endsWith('/ppm/waiting'))return ok({waiting});
 // The server seats a player from the cage list (member no., buy-in, start time).
 if(url.endsWith('/ppm/seat')){const b=JSON.parse(opts.body);seatCalls.push(b);const w=waiting.find(x=>x.id===b.id);const t=tables.find(x=>x.id===b.table_id),s=t.seats.find(x=>x.id===b.seat_id);
  Object.assign(s,{memberId:w.member_no,status:'seated',lastActiveStart:Date.now(),sessionStart:'2026-11-22 21:00:00',buyInAmount:w.amount});waiting=waiting.filter(x=>x!==w);return ok({version:++version,tables})}
 if(opts.method==='PUT'){writes++;const b=JSON.parse(opts.body);assert.equal(b.version,version);tables=b.tables;return ok({version:++version,tables})}
 if(delay)await new Promise(r=>resolveRead=r);return ok({version,tables})};
const App=require('/tmp/ppm-app-test.cjs').default;
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{let app;await act(async()=>{app=create(React.createElement(App));await flush()});
const buttons=()=>app.root.findAllByType('button');const text=b=>[].concat(b.props.children).join('');const button=t=>buttons().find(b=>text(b)===t);
await act(async()=>{button('開桌 / 繼續').props.onClick();await flush()});
assert.ok(!button('上桌')&&!button('下桌')&&!buttons().some(b=>text(b).includes('加碼')),'Seat, Leave and + Chips are done at the cage now');
// A cage buy-in pops up; pick a free seat and seat the player.
waiting=[{id:7,member_no:'EV-000001',name:'Alice',amount:2500,created_at:Math.floor(Date.now()/1000),created_by:'Mary Anne',nationality:'Taiwan'}];
await act(async()=>{poll();await flush()});await act(async()=>{await flush()});
const dialog=()=>app.root.findAll(n=>n.props&&n.props.className==='cash-dialog cage-seat-dialog');
assert.equal(dialog().length,1,'pop-up for the waiting player');
await act(async()=>buttons().find(b=>b.props['aria-label']==='Seat 1').props.onClick());
await act(async()=>{buttons().find(b=>text(b).startsWith('入座 T1')).props.onClick();await flush()});
assert.deepEqual(seatCalls[0],{id:7,table_id:1,seat_id:1});assert.equal(tables[0].seats[0].memberId,'EV-000001');assert.equal(tables[0].seats[0].buyInAmount,2500);assert.equal(dialog().length,0,'pop-up closes');
// Later hides the pop-up; the list button opens it again.
waiting=[{id:8,member_no:'EV-000002',name:'Bob',amount:3000,created_at:Math.floor(Date.now()/1000),created_by:'Mary Anne'}];
await act(async()=>{poll();await flush()});await act(async()=>{await flush()});assert.equal(dialog().length,1);
await act(async()=>button('稍後').props.onClick());assert.equal(dialog().length,0);
await act(async()=>button('入座').props.onClick());assert.equal(dialog().length,1,'opened again from the waiting list');
await act(async()=>button('稍後').props.onClick());
// Rest and back keep the session.
await act(async()=>{button('休息').props.onClick();await flush()});assert.equal(tables[0].seats[0].status,'rest');
await act(async()=>{button('回座').props.onClick();await flush()});assert.equal(tables[0].seats[0].status,'seated');assert.equal(tables[0].seats[0].buyInAmount,2500);
// Change Seat on the same table: the session moves to seat 4 and back; start time and buy-in are kept.
{const start=tables[0].seats[0].sessionStart;const answers=['4','T1 1'];window.prompt=()=>answers.shift();
await act(async()=>{button('⇄ 換位').props.onClick();await flush()});assert.equal(tables[0].seats[0].status,'idle');assert.equal(tables[0].seats[3].memberId,'EV-000001');assert.equal(tables[0].seats[3].buyInAmount,2500);assert.equal(tables[0].seats[3].sessionStart,start);
await act(async()=>{button('⇄ 換位').props.onClick();await flush()});assert.equal(tables[0].seats[3].status,'idle');assert.equal(tables[0].seats[0].memberId,'EV-000001');assert.equal(tables[0].seats[0].status,'seated');}
// Cash-out ready tells the cage; pressing again cancels.
await act(async()=>{button('準備結帳 → 通知帳房').props.onClick();await flush()});assert.equal(tables[0].seats[0].cashoutAsked.by,'Phoebe');
await act(async()=>{button('取消結帳通知').props.onClick();await flush()});assert.equal(tables[0].seats[0].cashoutAsked,null);
// Change level: a dialog confirms the new game and blinds.
{await act(async()=>button('換級別').props.onClick());const lf=()=>app.root.findAllByType('form').find(f=>f.props.className==='cash-dialog level-dialog');assert.ok(lf());
await act(async()=>lf().findAllByType('select')[0].props.onChange({target:{value:'PLO'}}));await act(async()=>{lf().props.onSubmit({preventDefault(){}});await flush()});assert.ok(!lf());assert.equal(tables[0].gameType,'PLO');}
// Left without the cage: still asks for the cash-out, so the session is complete.
const cashForm=()=>app.root.findAllByType('form').find(f=>f.props.className==='cash-dialog');
await act(async()=>button('離桌（未經帳房）').props.onClick());assert.ok(cashForm(),'opens the cash-out dialog');
await act(async()=>button('取消').props.onClick());assert.ok(!cashForm());assert.equal(tables[0].seats[0].status,'seated','cancel keeps the player seated');
await act(async()=>button('離桌（未經帳房）').props.onClick());
const cashInput=()=>app.root.findAllByType('input').find(i=>i.props.className==='cash-input');
await act(async()=>cashInput().props.onChange({target:{value:'4,000'}}));
await act(async()=>{cashForm().props.onSubmit({preventDefault(){}});await flush()});
assert.equal(tables[0].seats[0].status,'idle');assert.equal(tables[0].sessions[0].buyInAmount,2500);assert.equal(tables[0].sessions[0].cashOutAmount,4000);
app.unmount();console.log('PASS: cage pop-up seating, later + reopen, no seat/leave/+chips, rest/back, change seat, cash-out ready, change level, leave without cage');})().catch(e=>{console.error(e);process.exit(1)});
