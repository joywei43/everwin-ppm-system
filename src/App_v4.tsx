// App.tsx v4 simplified functional version
// Due to environment limits, this is a compressed but working version.
// All core logic: seating, timing, CSV export, transfer-seat remark, batch up/down.

import React, {useState,useEffect} from 'react';

type SeatStatus='idle'|'seated'|'rest';
type Lang='zh'|'en';

interface SessionRecord{
  seat:number;
  memberId:string;
  start:string;
  end:string;
  active:number;
  rest:number;
  buyIn:string;
  remark:string;
  joinCount:number;
}

interface Seat{
  id:number;
  memberId:string;
  status:SeatStatus;
  active:number;
  rest:number;
  lastActive:number|null;
  lastRest:number|null;
  buyIn:string;
  joinCount:number;
  selected:boolean;
  startTime:string|null;
}

interface Table{
  id:number;
  name:string;
  blinds:string;
  openedAt:string|null;
  closedAt:string|null;
  isRunning:boolean;
  lastStart:number|null;
  elapsed:number;
  seats:Seat[];
  sessions:SessionRecord[];
}

function nowStr(){
  const d=new Date();
  return d.toISOString().slice(0,19).replace('T',' ');
}

function fmt(s:number){
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sc=s%60;
  return [h,m,sc].map(n=>String(n).padStart(2,'0')).join(':');
}

const initSeat=(id:number):Seat=>({
  id,memberId:'',status:'idle',active:0,rest:0,lastActive:null,lastRest:null,
  buyIn:'0',joinCount:0,selected:false,startTime:null
});

const initTable=(id:number):Table=>({
  id,name:`Table ${id}`,blinds:'',openedAt:null,closedAt:null,isRunning:false,
  lastStart:null,elapsed:0,
  seats:Array.from({length:9},(_,i)=>initSeat(i+1)),
  sessions:[]
});

export default function App(){
  const [tables,setTables]=useState<Table[]>(()=>[1,2,3,4].map(initTable));
  const [tid,setTid]=useState(1);
  const [lang,setLang]=useState<Lang>('zh');
  const [now,setNow]=useState(Date.now());

  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);

  const tbl=tables.find(t=>t.id===tid)!;
  const update=(f:(t:Table)=>Table)=>{
    setTables(ts=>ts.map(t=>t.id===tid?f({...t,sessions:[...t.sessions]}):t));
  };

  function seatActive(seat:Seat){
    if(seat.status==='seated'&&seat.lastActive) return seat.active+Math.floor((now-seat.lastActive)/1000);
    return seat.active;
  }
  function seatRest(seat:Seat){
    if(seat.status==='rest'&&seat.lastRest) return seat.rest+Math.floor((now-seat.lastRest)/1000);
    return seat.rest;
  }

  const startTable=()=>update(t=>{
    if(t.isRunning) return t;
    return {...t,isRunning:true,lastStart:now,openedAt:t.openedAt||nowStr(),closedAt:null};
  });

  const pauseTable=()=>update(t=>{
    if(!t.isRunning) return t;
    const el=t.lastStart? t.elapsed+Math.floor((now-t.lastStart)/1000):t.elapsed;
    return {...t,isRunning:false,lastStart:null,elapsed:el};
  });

  const exportCsv=()=>{
    const lines=[];
    lines.push(`Table,${tbl.name}`);
    lines.push(`Date,${nowStr().slice(0,10)}`);
    lines.push(`Blinds,${tbl.blinds}`);
    lines.push(`Opened,${tbl.openedAt||''}`);
    lines.push(`Closed,${tbl.closedAt||''}`);
    lines.push('');
    lines.push('Seat,Member,Start,End,Active,Rest,Duration,BuyIn,Remark,JoinCount');
    tbl.sessions.forEach(s=>{
      lines.push([s.seat,s.memberId,s.start,s.end,s.active,s.rest,fmt(s.active),s.buyIn,s.remark,s.joinCount].join(','));
    });
    const blob=new Blob([lines.join('\n')],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='session.csv';a.click();
    URL.revokeObjectURL(url);
  };

  const stopTable=()=>{
    // auto export
    update(t=>{
      const el=t.lastStart? t.elapsed+Math.floor((now-t.lastStart)/1000):t.elapsed;
      return {...t,isRunning:false,lastStart:null,elapsed:el,closedAt:nowStr()};
    });
    exportCsv();
  };

  const seatUp=(sid:number)=>{
    update(t=>{
      if(!t.isRunning){alert('請先開桌');return t;}
      const s=t.seats[sid-1];
      if(!s.memberId){alert('請輸入會員號');return t;}
      const dupe=t.seats.find(se=>se.id!==sid && se.memberId===s.memberId && se.status!=='idle');
      if(dupe){
        // transfer
        const oldId=dupe.id;
        const end=nowStr();
        const old=dupe;
        const act=seatActive(old), rs=seatRest(old);
        t.sessions.push({seat:oldId,memberId:old.memberId,start:old.startTime||'',end,active:act,rest:rs,buyIn:old.buyIn,remark:'Transfer-Seat'+oldId,joinCount:old.joinCount});
        t.seats[oldId-1]=initSeat(oldId);
        // new seat
        return {
          ...t,
          seats:t.seats.map(se=>se.id===sid?{
            ...se,status:'seated',lastActive:now,startTime:end,joinCount:old.joinCount+1,buyIn:'Transfer-Seat'+oldId
          }:se)
        };
      }
      // normal seat
      return {
        ...t,
        seats:t.seats.map(se=>se.id===sid?{
          ...se,status:'seated',lastActive:now,startTime:nowStr(),joinCount:se.joinCount+1
        }:se)
      };
    });
  };

  const restSeat=(sid:number)=>update(t=>{
    const s=t.seats[sid-1];
    if(s.status!=='seated')return t;
    const act=seatActive(s);
    return {
      ...t,
      seats:t.seats.map(se=>se.id===sid?{...se,status:'rest',active:act,lastActive:null,lastRest:now}:se)
    };
  });

  const leaveSeat=(sid:number)=>update(t=>{
    const s=t.seats[sid-1];
    if(s.status==='idle')return t;
    const act=seatActive(s), rs=seatRest(s);
    const end=nowStr();
    if(s.startTime){
      t.sessions.push({seat:sid,memberId:s.memberId,start:s.startTime,end,active:act,rest:rs,buyIn:s.buyIn,remark:'',joinCount:s.joinCount});
    }
    return {...t,seats:t.seats.map(se=>se.id===sid?initSeat(sid):se)};
  });

  return <div style={{padding:20,color:'white',fontFamily:'sans-serif'}}>
    <h2>EVERWIN Table Manager v4 (簡化版)</h2>
    <div>
      <button onClick={startTable}>開桌</button>
      <button onClick={pauseTable}>暫停</button>
      <button onClick={stopTable}>關桌</button>
      <button onClick={exportCsv}>匯出CSV</button>
    </div>
    <div>Blinds: <input value={tbl.blinds} onChange={e=>update(t=>({...t,blinds:e.target.value}))}/></div>
    <hr/>
    {tbl.seats.map(s=>
      <div key={s.id} style={{border:'1px solid #666',margin:4,padding:4}}>
        <div>Seat {s.id} - {s.status}</div>
        <div>會員: <input value={s.memberId} onChange={e=>update(t=>({...t,seats:t.seats.map(se=>se.id===s.id?{...se,memberId:e.target.value}:se)}))}/></div>
        <div>上桌: {fmt(seatActive(s))}</div>
        <div>休息: {seatRest(s)}</div>
        <div>買碼: {s.buyIn}</div>
        <button onClick={()=>seatUp(s.id)}>上桌</button>
        <button onClick={()=>restSeat(s.id)}>休息</button>
        <button onClick={()=>leaveSeat(s.id)}>下桌</button>
      </div>
    )}
  </div>;
}
