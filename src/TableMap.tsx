import React from 'react';

// The room as it is laid out, so staff pick the table by where it stands, not by its number.
const SPOT: Record<string, { left: number; top: number }> = {
  T5: { left: 0, top: 0 },
  T2: { left: 52, top: 0 },
  T3: { left: 19, top: 34 },
  T1: { left: 54, top: 66 },
};

type T = { id: number; name?: string; isRunning?: boolean; gameType?: string; blinds?: string; seats?: { status?: string }[] };

export default function TableMap(props: { tables: T[]; currentId: number; onPick: (id: number) => void }) {
  const placed = props.tables.filter((t) => SPOT[t.name || '']);
  if (!placed.length) return null;
  return (
    <div className="table-map" role="group" aria-label="Room layout">
      {placed.map((t) => {
        const spot = SPOT[t.name || ''];
        const seated = (t.seats || []).filter((s) => s.status && s.status !== 'idle').length;
        const active = t.id === props.currentId;
        return (
          <button key={t.id} type="button" className={'tm-table' + (active ? ' tm-active' : '') + (t.isRunning ? ' tm-running' : '')}
            style={{ left: spot.left + '%', top: spot.top + '%' }} onClick={() => props.onPick(t.id)} aria-pressed={active}
            aria-label={`${t.name}${t.isRunning ? ` running, ${t.gameType} ${t.blinds}, ${seated} seated` : ', closed'}`}>
            <span className="tm-felt">
              <span className="tm-name">{t.name}</span>
              {t.isRunning && <span className="tm-info">{t.gameType} {t.blinds} · {seated}</span>}
            </span>
            {t.isRunning && <span className="tm-dot" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
