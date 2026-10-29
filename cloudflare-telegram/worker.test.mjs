import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from './schema.mjs';
import worker, { poll, update, source } from './worker.mjs';

function db() {
  const sql=new DatabaseSync(':memory:');sql.exec(SCHEMA);
  const wrap=(query,args=[])=>({bind:(...a)=>wrap(query,a),first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>sql.prepare(query).run(...args)});
  return {sql,prepare:wrap,batch:async statements=>{sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
function state(players=5,opened=true) {return {state:{tableOpen:[opened,false,false,false],occupied:[Array.from({length:9},(_,i)=>Number(i<players)),...Array.from({length:3},()=>Array(9).fill(0))],tableTypes:Array(4).fill('NLH'),games:Array(4).fill('50 / 100')}};}
const runtime=db=>JSON.parse(db.sql.prepare('SELECT data FROM bot_runtime').get().data);
test('poll separates group/channel cadence and acknowledges accepted delivery; no duplicate snapshots',async()=>{
  const DB=db(),env={DB,BOT_TOKEN:'test',OWNER_ID:'1'},old=global.fetch;
  DB.sql.exec("INSERT INTO bot_settings VALUES('connected','1'),('enabled','1'); INSERT INTO bot_destinations VALUES('-1','group','Players'),('-2','channel','Midori');");
  let live=state(4);const sent=[];
  global.fetch=async(url,options)=>{
    if(url.endsWith('/state'))return Response.json(live);
    sent.push(JSON.parse(options.body));return Response.json({ok:true,result:{message_id:1}});
  };
  try {
    await poll(env);assert.equal(sent.length,0);
    live=state(5);await poll(env);assert.equal(sent.length,2);assert.ok(runtime(DB).groupAt);assert.ok(runtime(DB).channelAt);
    await poll(env);assert.equal(sent.length,2);
    live=state(6);await poll(env);assert.equal(sent.length,3);assert.equal(sent.at(-1).chat_id,'-2');
    live=state(5);await poll(env);assert.equal(sent.length,3);
    const saved=runtime(DB);saved.groupAt=Math.floor(Date.now()/1000)-3600;saved.channelAt=Math.floor(Date.now()/1000)-1800;
    DB.sql.prepare('UPDATE bot_runtime SET data=?').run(JSON.stringify(saved));
    await poll(env);assert.equal(sent.length,5);
  }finally{global.fetch=old;DB.sql.close();}
});
test('Telegram failure persists retry without advancing last successful notification',async()=>{
  const DB=db(),env={DB,BOT_TOKEN:'test',OWNER_ID:'1'},old=global.fetch;
  DB.sql.exec("INSERT INTO bot_settings VALUES('connected','1'),('enabled','1'); INSERT INTO bot_destinations VALUES('-2','channel','Midori');");
  global.fetch=async url=>url.endsWith('/state')?Response.json(state()):Response.json({ok:false,error_code:429,parameters:{retry_after:120}});
  try{await poll(env);assert.equal(runtime(DB).channelAt,null);const row=DB.sql.prepare('SELECT * FROM bot_jobs').get();assert.equal(row.status,'pending');assert.equal(row.attempts,1);assert.ok(row.due-row.created>=120);}finally{global.fetch=old;DB.sql.close();}
});
test('webhook authentication rejects forged commands before user data is changed',async()=>{
  const DB=db();DB.sql.exec("INSERT INTO bot_settings VALUES('webhook_secret','valid')");
  const r=await worker.fetch(new Request('https://example.workers.dev/telegram',{method:'POST',body:JSON.stringify({update_id:1,message:{from:{id:1},chat:{id:1,type:'private'},text:'/updateson'}})}),{DB});
  assert.equal(r.status,403);assert.equal(DB.sql.prepare('SELECT COUNT(*) n FROM bot_updates').get().n,0);DB.sql.close();
});
test('subscribe is private, opt-out and webhook replays are idempotent; booking commands removed',async()=>{
  const DB=db(),old=global.fetch,env={DB,BOT_TOKEN:'test',OWNER_ID:'1'};global.fetch=async()=>Response.json({ok:true,result:{}});
  const make=(n,data)=>({update_id:n,callback_query:{id:String(n),from:{id:1},message:{chat:{id:1,type:'private'}},data}});
  try{
    await update(env,make(1,'sub:NLH'));assert.equal(DB.sql.prepare('SELECT filter FROM bot_subscribers').get().filter,'NLH');
    await update(env,make(1,'sub:PLO'));assert.equal(DB.sql.prepare('SELECT filter FROM bot_subscribers').get().filter,'NLH');
    await update(env,make(2,'sub:off'));assert.equal(DB.sql.prepare('SELECT filter FROM bot_subscribers').get().filter,'off');
    await update(env,{update_id:3,message:{from:{id:1},chat:{id:1,type:'private'},text:'/join'}});
    assert.match(DB.sql.prepare("SELECT payload FROM bot_jobs WHERE id='reply:3:0'").get().payload,/reserve your seat/);
    assert.equal(DB.sql.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='bookings'").get().n,0);
  }finally{global.fetch=old;DB.sql.close();}
});
test('source failure never invents empty room or triggers closing message',async()=>{
  await assert.rejects(()=>source(async()=>new Response('unavailable',{status:503})),/SOURCE_UNAVAILABLE/);
});
