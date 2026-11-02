import React, { useEffect, useRef, useState } from 'react';

export const GAME_TYPES = ['NLH', 'PLO', 'Others'];
export const BLINDS = ['25 / 50', '50 / 50', '50 / 100', '100 / 100', '100 / 200'];

const TEXT = {
  zh: { title: (n: string) => `${n} 換級別`, now: '目前', to: '換成', game: '遊戲', blinds: '盲注', same: '級別沒有變更。', confirm: '確認換級別', cancel: '取消',
    note: '換級別後，桌時會從現在起記在新級別；桌上玩家的時數照常累計。' },
  en: { title: (n: string) => `Change level · ${n}`, now: 'Now', to: 'Change to', game: 'Game', blinds: 'Blinds', same: 'The level is the same.', confirm: 'Change level', cancel: 'Cancel',
    note: 'Table hours count toward the new level from now on; players keep their time.' },
};

// Asks for the new game and blinds, then confirms the change.
export default function LevelDialog(props: {
  table: string; gameType: string; blinds: string; lang: 'zh' | 'en';
  onConfirm: (gameType: string, blinds: string) => void; onCancel: () => void;
}) {
  const t = TEXT[props.lang];
  const [game, setGame] = useState(props.gameType);
  const [blinds, setBlinds] = useState(props.blinds);
  const [error, setError] = useState('');
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (game === props.gameType && blinds === props.blinds) { setError(t.same); return; }
    props.onConfirm(game, blinds);
  };
  return (
    <div className="cash-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onCancel(); }}>
      <form className="cash-dialog level-dialog" role="dialog" aria-modal="true" aria-labelledby="level-title" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') props.onCancel(); }}>
        <h2 id="level-title">{t.title(props.table)}</h2>
        <p className="cash-sub">{t.now}: <b>{props.gameType} {props.blinds}</b></p>
        <div className="level-row">
          <label>{t.game}<select ref={first} className="info-input" value={game} onChange={(e) => { setError(''); setGame(e.target.value); }}>{GAME_TYPES.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label>{t.blinds}<select className="info-input" value={blinds} onChange={(e) => { setError(''); setBlinds(e.target.value); }}>{BLINDS.map((v) => <option key={v}>{v}</option>)}</select></label>
        </div>
        <p className="level-to">{t.to}: <b>{game} {blinds}</b></p>
        <p className="cash-sub">{t.note}</p>
        {error && <p className="cash-error" role="alert">{error}</p>}
        <div className="cash-actions">
          <button type="button" className="seat-btn" onClick={props.onCancel}>{t.cancel}</button>
          <button type="submit" className="seat-btn btn-xs-yellow">{t.confirm}</button>
        </div>
      </form>
    </div>
  );
}
