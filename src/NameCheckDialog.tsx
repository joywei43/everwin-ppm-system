import React, { useEffect, useRef } from 'react';
import type { MemberBrief } from './cloud';

const TEXT = {
  zh: { title: '這個名字不是會員', sub: (r: string) => `「${r}」對不到任何會員。是不是下面這位？`, none: (r: string) => `「${r}」對不到任何會員，也找不到相近的名字。`, guest: '以訪客身分上桌', cancel: '取消，回去改名字', hint: '新客人請之後到後台建立會員，再到 Unmatched PPM 連結。' },
  en: { title: 'Not a member', sub: (r: string) => `"${r}" does not match any member. Did you mean:`, none: (r: string) => `"${r}" does not match any member, and no similar name was found.`, guest: 'Seat as guest', cancel: 'Cancel and fix the name', hint: 'For a new player, add them in the admin console later and link them in Unmatched PPM.' },
};
export const memberLabel = (m: MemberBrief) => `${(m.nickname || m.name || '').trim().slice(0, 45)} (${m.member_no.replace(/^EV-/i, '')})`;

// Shown when the name typed for a seat is not a member: pick the right member, seat as a guest, or go back.
export default function NameCheckDialog(props: { refName: string; suggestions: MemberBrief[]; lang: 'zh' | 'en'; onPick: (label: string) => void; onGuest: () => void; onCancel: () => void }) {
  const t = TEXT[props.lang];
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <div className="cash-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onCancel(); }}>
      <div className="cash-dialog name-check" role="dialog" aria-modal="true" aria-labelledby="nc-title" onKeyDown={(e) => { if (e.key === 'Escape') props.onCancel(); }}>
        <h2 id="nc-title">{t.title}</h2>
        <p className="cash-sub">{props.suggestions.length ? t.sub(props.refName) : t.none(props.refName)}</p>
        <div className="nc-list">
          {props.suggestions.map((m, i) => (
            <button key={m.member_no} ref={i === 0 ? first : undefined} type="button" className="nc-pick" onClick={() => props.onPick(memberLabel(m))}>
              <b>{m.nickname || m.name}</b> <span className="nc-no">{m.member_no}</span>
              {m.name && m.name !== m.nickname ? <span className="nc-sub">{m.name}{m.nationality ? ' · ' + m.nationality : ''}</span> : m.nationality ? <span className="nc-sub">{m.nationality}</span> : null}
            </button>
          ))}
        </div>
        <p className="cash-sub" style={{ marginTop: 10 }}>{t.hint}</p>
        <div className="cash-actions">
          <button type="button" className="seat-btn" onClick={props.onCancel}>{t.cancel}</button>
          <button type="button" ref={props.suggestions.length ? undefined : first} className="seat-btn btn-xs-yellow" onClick={props.onGuest}>{t.guest}</button>
        </div>
      </div>
    </div>
  );
}
