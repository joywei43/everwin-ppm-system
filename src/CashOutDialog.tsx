import React, { useEffect, useRef, useState } from 'react';

export interface CashOutSeat { id: number; memberId: string; buyInAmount: number; }
export interface CashOutResult { amount: number; busted: boolean; }

const TEXT = {
  zh: { title: '下桌結帳', one: (n: string) => `${n} 下桌，請輸入結碼金額`, many: (k: number) => `${k} 位玩家下桌，請輸入各自的結碼金額`, seat: '席次', buyIn: '買碼', cashOut: '結碼金額', busted: 'Busted（輸光）', cancel: '取消', confirm: '結帳', required: '請輸入結碼金額，輸光請按 Busted。', wl: '輸贏' },
  en: { title: 'Cash out', one: (n: string) => `${n} is leaving. Enter the cash-out amount.`, many: (k: number) => `${k} players are leaving. Enter each cash-out amount.`, seat: 'Seat', buyIn: 'Buy-in', cashOut: 'Cash-out', busted: 'Busted', cancel: 'Cancel', confirm: 'Cash out', required: 'Enter a cash-out amount, or tap Busted if they lost it all.', wl: 'W/L' },
};

// Asks for the chips each leaving player takes home. "Busted" records 0 (lost the whole buy-in).
export default function CashOutDialog(props: {
  seats: CashOutSeat[]; lang: 'zh' | 'en';
  onConfirm: (results: Record<number, CashOutResult>) => void; onCancel: () => void;
}) {
  const t = TEXT[props.lang];
  const [values, setValues] = useState<Record<number, string>>({});
  const [busted, setBusted] = useState<Record<number, boolean>>({});
  const [error, setError] = useState('');
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);

  const amountOf = (id: number) => (busted[id] ? 0 : Number((values[id] ?? '').replace(/[,\s]/g, '')));
  const valid = (id: number) => busted[id] || ((values[id] ?? '').trim() !== '' && Number.isFinite(amountOf(id)) && amountOf(id) >= 0);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!props.seats.every((s) => valid(s.id))) { setError(t.required); return; }
    const out: Record<number, CashOutResult> = {};
    for (const s of props.seats) out[s.id] = { amount: Math.round(amountOf(s.id)), busted: !!busted[s.id] };
    props.onConfirm(out);
  };
  const fmt = (n: number) => n.toLocaleString('en-US');

  return (
    <div className="cash-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onCancel(); }}>
      <form className="cash-dialog" role="dialog" aria-modal="true" aria-labelledby="cash-title" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') props.onCancel(); }}>
        <h2 id="cash-title">{t.title}</h2>
        <p className="cash-sub">{props.seats.length === 1 ? t.one(props.seats[0].memberId) : t.many(props.seats.length)}</p>
        {props.seats.map((s, i) => {
          const wl = valid(s.id) ? amountOf(s.id) - s.buyInAmount : null;
          return (
            <div className="cash-row" key={s.id}>
              <div className="cash-who">
                <b>{t.seat} {s.id} · {s.memberId}</b>
                <span>{t.buyIn} {fmt(s.buyInAmount)}{wl !== null && <> · {t.wl} <b className={wl >= 0 ? 'cash-win' : 'cash-loss'}>{wl >= 0 ? '+' : ''}{fmt(wl)}</b></>}</span>
              </div>
              <div className="cash-inputs">
                <label className="cash-sr" htmlFor={'co' + s.id}>{t.cashOut}</label>
                <input id={'co' + s.id} ref={i === 0 ? first : undefined} className="cash-input" inputMode="numeric" placeholder={t.cashOut}
                  value={busted[s.id] ? '0' : values[s.id] ?? ''} disabled={!!busted[s.id]}
                  onChange={(e) => { setError(''); setValues((v) => ({ ...v, [s.id]: e.target.value })); }} />
                <button type="button" className={'cash-busted' + (busted[s.id] ? ' on' : '')} aria-pressed={!!busted[s.id]}
                  onClick={() => { setError(''); setBusted((b) => ({ ...b, [s.id]: !b[s.id] })); }}>{t.busted}</button>
              </div>
            </div>
          );
        })}
        {error && <p className="cash-error" role="alert">{error}</p>}
        <div className="cash-actions">
          <button type="button" className="seat-btn" onClick={props.onCancel}>{t.cancel}</button>
          <button type="submit" className="seat-btn btn-xs-red">{t.confirm}</button>
        </div>
      </form>
    </div>
  );
}
