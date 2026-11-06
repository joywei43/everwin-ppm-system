import React, { useEffect, useRef, useState } from 'react';
import { fetchGroups, quickAddMember, type GroupOpt, type MemberBrief } from './cloud';

const NATIONALITIES = ['Taiwan', 'Philippines', 'South Korea', 'Japan', 'Hong Kong', 'Macau', 'China', 'Singapore', 'Thailand', 'Indonesia', 'Malaysia', 'Vietnam', 'India', 'United States', 'Canada', 'Australia', 'United Kingdom'];
const TEXT = {
  zh: { title: '這個名字不是會員', sub: (r: string) => `「${r}」對不到任何會員。是不是下面這位？`, none: (r: string) => `「${r}」對不到任何會員，也找不到相近的名字。`, guest: '以訪客身分上桌', cancel: '取消，回去改名字',
    add: '＋ 新會員（現在建立）', addTitle: '新增會員並入座', addSub: '三項都必填。全名、生日、電話等之後到後台補。', nick: '暱稱', nat: '國籍', natOther: '其他…', natType: '輸入國家', group: 'Player Group', choose: '請選擇', save: '建立並入座', saving: '建立中…', back: '返回',
    need: '暱稱、國籍、Player Group 都要填。', dupTitle: '可能已經是會員', dupSub: '下面這位很像同一個人。是他的話請直接選他入座：', same: (w: string[]) => '相同：' + w.join('、'), anyway: '不是，仍然建立新會員' },
  en: { title: 'Not a member', sub: (r: string) => `"${r}" does not match any member. Did you mean:`, none: (r: string) => `"${r}" does not match any member, and no similar name was found.`, guest: 'Seat as guest', cancel: 'Cancel and fix the name',
    add: '+ New member (add now)', addTitle: 'Add a member and seat', addSub: 'All three are required. Full name, birthday and phone can be added later in the admin console.', nick: 'Nickname', nat: 'Nationality', natOther: 'Other…', natType: 'Type the country', group: 'Player group', choose: 'Choose', save: 'Add and seat', saving: 'Adding…', back: 'Back',
    need: 'Nickname, nationality and player group are all required.', dupTitle: 'May already be a member', dupSub: 'This looks like the same person. If so, pick them to seat:', same: (w: string[]) => 'Same ' + w.join(', '), anyway: 'No, add a new member anyway' },
};
export const memberLabel = (m: MemberBrief) => `${(m.nickname || m.name || '').trim().slice(0, 45)} (${m.member_no.replace(/^EV-/i, '')})`;

// Shown when the name typed for a seat is not a member: pick the right member, add a new member right here, seat as a guest, or go back.
export default function NameCheckDialog(props: { refName: string; where: string; suggestions: MemberBrief[]; lang: 'zh' | 'en'; onPick: (label: string) => void; onGuest: () => void; onCancel: () => void }) {
  const t = TEXT[props.lang];
  const first = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<'pick' | 'add'>('pick');
  const [nick, setNick] = useState(props.refName.replace(/\s*\(.*\)\s*$/, '').trim().slice(0, 60));
  const [natSel, setNatSel] = useState('');
  const [natOther, setNatOther] = useState('');
  const [group, setGroup] = useState('');
  const [groups, setGroups] = useState<GroupOpt[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dups, setDups] = useState<(MemberBrief & { why?: string[] })[] | null>(null);
  useEffect(() => { first.current?.focus(); }, [mode]);
  useEffect(() => { if (mode === 'add' && !groups) fetchGroups().then(setGroups); }, [mode, groups]);
  const nationality = natSel === 'other' ? natOther.trim() : natSel;

  const add = async (confirm = false) => {
    if (!nick.trim() || !nationality || !group) { setError(t.need); return; }
    setBusy(true); setError('');
    const r = await quickAddMember({ nickname: nick.trim(), nationality, group_id: group, where: props.where, confirm_duplicate: confirm });
    setBusy(false);
    if ('member_no' in r) props.onPick(memberLabel({ member_no: r.member_no, nickname: nick.trim(), name: nick.trim() }));
    else if ('duplicates' in r) setDups(r.duplicates);
    else setError(r.error);
  };

  const pickList = (list: (MemberBrief & { why?: string[] })[]) => (
    <div className="nc-list">
      {list.map((m, i) => (
        <button key={m.member_no} ref={i === 0 ? first : undefined} type="button" className="nc-pick" onClick={() => props.onPick(memberLabel(m))}>
          <b>{m.nickname || m.name}</b> <span className="nc-no">{m.member_no}</span>
          <span className="nc-sub">{[m.name && m.name !== m.nickname ? m.name : '', m.nationality || '', m.why && m.why.length ? t.same(m.why) : ''].filter(Boolean).join(' · ')}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="cash-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) props.onCancel(); }}>
      <div className="cash-dialog name-check" role="dialog" aria-modal="true" aria-labelledby="nc-title" onKeyDown={(e) => { if (e.key === 'Escape' && !busy) props.onCancel(); }}>
        {mode === 'pick' ? (<>
          <h2 id="nc-title">{t.title}</h2>
          <p className="cash-sub">{props.suggestions.length ? t.sub(props.refName) : t.none(props.refName)}</p>
          {pickList(props.suggestions)}
          <button type="button" ref={props.suggestions.length ? undefined : first} className="nc-add" onClick={() => setMode('add')}>{t.add}</button>
          <div className="cash-actions">
            <button type="button" className="seat-btn" onClick={props.onCancel}>{t.cancel}</button>
            <button type="button" className="seat-btn btn-xs-yellow" onClick={props.onGuest}>{t.guest}</button>
          </div>
        </>) : dups ? (<>
          <h2 id="nc-title">{t.dupTitle}</h2>
          <p className="cash-sub">{t.dupSub}</p>
          {pickList(dups)}
          <div className="cash-actions">
            <button type="button" className="seat-btn" disabled={busy} onClick={() => setDups(null)}>{t.back}</button>
            <button type="button" className="seat-btn btn-xs-yellow" disabled={busy} onClick={() => add(true)}>{busy ? t.saving : t.anyway}</button>
          </div>
          {error && <p className="cash-error" role="alert">{error}</p>}
        </>) : (
          <form onSubmit={(e) => { e.preventDefault(); add(); }}>
            <h2 id="nc-title">{t.addTitle}</h2>
            <p className="cash-sub">{t.addSub}</p>
            <label className="nc-field">{t.nick}
              <input className="cash-input" value={nick} maxLength={60} required onChange={(e) => setNick(e.target.value)} autoFocus /></label>
            <label className="nc-field">{t.nat}
              <select className="cash-input" value={natSel} required onChange={(e) => setNatSel(e.target.value)}>
                <option value="">{t.choose}</option>{NATIONALITIES.map((n) => <option key={n}>{n}</option>)}<option value="other">{t.natOther}</option>
              </select></label>
            {natSel === 'other' && <label className="nc-field">{t.natType}<input className="cash-input" value={natOther} maxLength={60} required onChange={(e) => setNatOther(e.target.value)} /></label>}
            <label className="nc-field">{t.group}
              <select className="cash-input" value={group} required onChange={(e) => setGroup(e.target.value)}>
                <option value="">{groups ? t.choose : '…'}</option>
                {(groups || []).map((g) => <option key={g.id} value={g.id}>{g.name}{g.label ? ' — ' + g.label : ''}</option>)}
              </select></label>
            {error && <p className="cash-error" role="alert">{error}</p>}
            <div className="cash-actions">
              <button type="button" className="seat-btn" disabled={busy} onClick={() => { setMode('pick'); setError(''); }}>{t.back}</button>
              <button type="submit" className="seat-btn btn-xs-yellow" disabled={busy}>{busy ? t.saving : t.save}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
