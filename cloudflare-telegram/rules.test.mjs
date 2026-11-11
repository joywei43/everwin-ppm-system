import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transition, message, readTables, THANK_YOU, dailyInvitation } from './rules.mjs';
const table = (players, open = true, id = 'T1') => ({ id, players, open, game:'NLH', stakes:'50/100', capacity:9 });
test('new table waits for five, each increase only interrupts channel', () => {
  let r = transition({},[table(0)],100); assert.equal(r.group,null); assert.equal(r.channel,null);
  r=transition(r.state,[table(4)],200); assert.equal(r.channel,null);
  r=transition(r.state,[table(5)],300); assert.equal(r.group.reason,'new-table'); assert.equal(r.channel.reason,'new-table');
  r=transition(r.state,[table(6)],400); assert.equal(r.group,null); assert.equal(r.channel.reason,'increase');
  r=transition(r.state,[table(5)],500); assert.equal(r.group,null); assert.equal(r.channel,null);
  r=transition(r.state,[table(6)],600); assert.equal(r.channel.reason,'increase');
  r=transition(r.state,[table(6)],2399); assert.equal(r.channel,null);
  r=transition(r.state,[table(6)],2400); assert.equal(r.channel.reason,'periodic'); assert.equal(r.group,null);
  r=transition(r.state,[table(6)],3900); assert.equal(r.group.reason,'periodic'); assert.equal(r.channel,null);
});
test('full is one channel event; reservation line only when second table absent', () => {
  const r=transition(transition({},[table(8)],100).state,[table(9)],200);
  assert.equal(r.channel.reason,'full'); assert.deepEqual(r.channel.full,['T1']);
  const text=message([table(9)],200,r.channel);
  assert.match(text,/TABLE FULL/); assert.match(text,/Reservations are now open for a second table/);
  assert.equal((text.match(/TIME:/g)||[]).length,1); assert.doesNotMatch(text,/TEST|held|Updated|座位/);
  assert.doesNotMatch(message([table(9),table(5,true,'T2')],200,r.channel),/Reservations are now open/);
});
test('closure stops periodic; reopening waits again; state survives restart', () => {
  let r=transition({},[table(5)],100);
  r=transition(JSON.parse(JSON.stringify(r.state)),[table(0,false)],4000);
  assert.equal(r.channel,null); assert.equal(r.group,null);
  r=transition(r.state,[table(3)],4010); assert.equal(r.channel,null); assert.equal(r.group,null);
  r=transition(r.state,[table(5)],4020); assert.equal(r.channel.reason,'new-table');
});
test('validates public data and uses Philippine time', () => {
  assert.throws(()=>readTables({}));
  const text=message([table(5)],Date.UTC(2026,9,29,16,0)/1000);
  assert.match(text,/TIME: 10\/30 00:00/);
});
const localTime = (day,hour,minute=0) => Date.UTC(2026,9,day,hour-8,minute)/1000;
test('last table closing at or after 04:00 GMT+8 emits exact common thank-you', () => {
  let r=transition({},[table(5)],localTime(30,3));
  r=transition(r.state,[table(0,false)],localTime(30,4,1));
  assert.equal(r.common.text,THANK_YOU);
  assert.equal(r.common.key,'thanks:2026-10-30');
  assert.equal(r.group,null); assert.equal(r.channel,null);
  r=transition(JSON.parse(JSON.stringify(r.state)),[table(0,false)],localTime(30,4,2));
  assert.equal(r.common,null);
  r=transition(r.state,[table(5)],localTime(30,5));
  r=transition(r.state,[table(0,false)],localTime(30,6));
  assert.equal(r.common,null);
  r=transition(r.state,[table(5)],localTime(31,3));
  r=transition(r.state,[table(0,false)],localTime(31,4));
  assert.equal(r.common.key,'thanks:2026-10-31');
});
test('pre-04:00 closure waits until 04:00; startup and partial closure never thank', () => {
  let r=transition({},[table(0,false)],localTime(30,5)); assert.equal(r.common,null);
  r=transition(r.state,[table(5),table(5,true,'T2')],localTime(30,3));
  r=transition(r.state,[table(0,false),table(5,true,'T2')],localTime(30,3,30)); assert.equal(r.common,null);
  r=transition(r.state,[table(0,false),table(0,false,'T2')],localTime(30,3,59)); assert.equal(r.common,null);
  r=transition(JSON.parse(JSON.stringify(r.state)),[table(0,false),table(0,false,'T2')],localTime(30,4)); assert.equal(r.common.text,THANK_YOU);
  r=transition(r.state,[table(0,false),table(0,false,'T2')],localTime(30,4,1)); assert.equal(r.common,null);
});

test('overdue periodic updates never publish below five, including next-day reopening',()=>{
  const previous={tables:[table(8)],ready:['T1'],groupAt:100,channelAt:100};
  for(const players of [0,1,4]){
    const r=transition(previous,[table(players)],10000);
    assert.equal(r.group,null);assert.equal(r.channel,null);
  }
  const r=transition(previous,[table(5)],10000);
  assert.equal(r.group.reason,'periodic');assert.equal(r.channel.reason,'periodic');
  const text=message([table(0),table(5,true,'T2')],10000,{minPlayers:5});
  assert.doesNotMatch(text,/T1 ·/);assert.match(text,/T2 ·/);
  assert.match(message([table(0)],10000),/0\/9 players/); // Explicit queries remain truthful.
});

test('reopening before 04:00 cancels waiting thanks until the last table closes again',()=>{
  let r=transition({},[table(5)],localTime(30,2));
  r=transition(r.state,[table(0,false)],localTime(30,3));assert.equal(r.state.pendingThanksDay,'2026-10-30');
  r=transition(r.state,[table(1)],localTime(30,3,30));assert.equal(r.state.pendingThanksDay,null);
  r=transition(r.state,[table(1)],localTime(30,4));assert.equal(r.common,null);
  r=transition(r.state,[table(0,false)],localTime(30,4,15));assert.equal(r.common.text,THANK_YOU);
});
test('missed exact 04:00 tick sends later that morning and expired pending closures never thank next day',()=>{
  let r=transition({},[table(5)],localTime(30,2));
  r=transition(r.state,[table(0,false)],localTime(30,3));const waiting=r.state;
  r=transition(JSON.parse(JSON.stringify(waiting)),[table(0,false)],localTime(30,4,3));assert.equal(r.common.text,THANK_YOU);
  r=transition(waiting,[table(0,false)],localTime(31,4));assert.equal(r.common,null);
});

test('daily invitation is due at 16:00 GMT+8 with requested Telegram contact',()=>{
  assert.equal(dailyInvitation(localTime(30,15,59)),null);
  const invite=dailyInvitation(localTime(30,16));
  assert.equal(invite.day,'2026-10-30');assert.match(invite.text,/Telegram: @MIDORIPOKER/);
  assert.equal(dailyInvitation(localTime(30,16,59)).day,invite.day);
  assert.equal(dailyInvitation(localTime(30,17)),null);
});
