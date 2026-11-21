import React, { useEffect, useState } from 'react';
import type { TableState } from './App';
import { memberPhoto, WaitingSeat } from './cloud';

// A player bought in at the cage: pick a running table and a free seat. Seat time starts when Seat is pressed.
export default function CageSeatDialog({ entry, tables, preferTableId, lang, busy, onSeat, onLater, onRemove }: {
  entry: WaitingSeat; tables: TableState[]; preferTableId: number; lang: 'zh' | 'en'; busy: boolean;
  onSeat: (tableId: number, seatId: number) => Promise<string | null>; onLater: () => void; onRemove: () => void;
}) {
  const zh = lang === 'zh';
  const running = tables.filter((t) => t.isRunning);
  const [tableId, setTableId] = useState<number>(running.some((t) => t.id === preferTableId) ? preferTableId : (running[0] ? running[0].id : 0));
  const table = tables.find((t) => t.id === tableId);
  const free = table ? table.seats.filter((s) => s.status === 'idle').map((s) => s.id) : [];
  const [seatId, setSeatId] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { let live = true; memberPhoto(entry.member_no).then((p) => { if (live) setPhoto(p); }); return () => { live = false; }; }, [entry.member_no]);
  useEffect(() => { if (seatId != null && !free.includes(seatId)) setSeatId(null); }, [tableId, free.join(',')]);
  const at = new Date(entry.created_at * 1000);
  const time = at.getHours().toString().padStart(2, '0') + ':' + at.getMinutes().toString().padStart(2, '0');
  const go = async () => { if (!table || seatId == null) return; setErr(''); const e = await onSeat(table.id, seatId); if (e) setErr(e); };
  return (
    <div className="cash-backdrop" role="dialog" aria-modal="true" aria-label="Seat player from the cage">
      <div className="cash-dialog cage-seat-dialog">
        <div className="cage-seat-kicker">{zh ? '帳房買入 · 請帶客人入座' : 'New player from the cage'}</div>
        <div className="cage-seat-who">
          <div className="cage-seat-photo">{photo ? <img src={photo} alt="" /> : <span>{(entry.name || '?').slice(0, 2).toUpperCase()}</span>}</div>
          <div>
            <div className="cage-seat-name">{entry.name}</div>
            <div className="cage-seat-sub">#{entry.member_no}{entry.nationality ? ' · ' + entry.nationality : ''}</div>
            <div className="cage-seat-sub">{zh ? '買入' : 'Buy-in'} <b>{entry.amount.toLocaleString('en-US')}</b> · {time}{entry.created_by ? ' · ' + entry.created_by : ''}</div>
          </div>
        </div>
        {!running.length ? <p className="cage-seat-err">{zh ? '目前沒有開桌，請先開桌。' : 'No table is running. Start a table first.'}</p> : (<>
          <label className="cage-seat-label">{zh ? '桌號' : 'Table'}
            <select value={tableId} onChange={(e) => setTableId(Number(e.target.value))} aria-label="Table">
              {running.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.blinds} {t.gameType} · {t.seats.filter((s) => s.status === 'idle').length} {zh ? '空位' : 'open'}</option>)}
            </select>
          </label>
          <div className="cage-seat-label">{zh ? '座位' : 'Seat'}</div>
          <div className="cage-seat-grid">
            {table && table.seats.map((s) => {
              const open = s.status === 'idle';
              return <button type="button" key={s.id} disabled={!open} aria-label={`Seat ${s.id}`}
                className={'cage-seat-cell' + (open ? ' open' : '') + (seatId === s.id ? ' picked' : '')} onClick={() => setSeatId(s.id)}>{s.id}</button>;
            })}
          </div>
        </>)}
        {err && <p className="cage-seat-err" role="alert">{err}</p>}
        <div className="cash-actions">
          <button type="button" className="seat-btn" onClick={onLater}>{zh ? '稍後' : 'Later'}</button>
          <button type="button" className="seat-btn btn-xs-green" disabled={busy || !table || seatId == null} onClick={go}>
            {table && seatId != null ? (zh ? `入座 ${table.name} · ${seatId} 號` : `Seat at ${table.name} · Seat ${seatId}`) : (zh ? '請選座位' : 'Pick a seat')}
          </button>
        </div>
        <div className="cage-seat-foot">{zh ? '按下入座後開始計時。' : 'Seat time starts when you press Seat.'} <button type="button" className="link-btn" onClick={onRemove}>{zh ? '客人沒有要玩（移除）' : 'Not playing (remove)'}</button></div>
      </div>
    </div>
  );
}
