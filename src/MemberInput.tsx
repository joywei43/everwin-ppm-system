import React, { useEffect, useRef, useState } from 'react';
import { searchMembers, MemberHit } from './cloud';

// Seat name box: type a member number or nickname and pick from the list.
// Picking fills in the member number so play time is credited to the right member.
export default function MemberInput(props: {
  value: string; disabled: boolean; placeholder: string; onChange: (e: { target: { value: string } }) => void;
}) {
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); seq.current++; }, []);

  const lookup = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const mine = ++seq.current;
      const found = await searchMembers(q);
      if (mine !== seq.current) return;
      setHits(found); setActive(0); setOpen(found.length > 0);
    }, 250);
  };
  const pick = (m: MemberHit) => { props.onChange({ target: { value: m.member_no } }); setOpen(false); setHits([]); };

  return (
    <div className="member-ac">
      <input
        className="member-input"
        placeholder={props.placeholder}
        value={props.value}
        disabled={props.disabled}
        maxLength={60}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => { props.onChange(e); lookup(e.target.value); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !hits.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(hits[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && !props.disabled && (
        <ul className="member-ac-list" role="listbox">
          {hits.map((m, i) => (
            <li key={m.member_no} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m)}>
                <span className="member-ac-no">{m.member_no}</span> {m.nick_label || m.nickname || m.name}
                <span className="member-ac-sub">{m.name}{m.group_name ? ' · ' + m.group_name : ''}{m.status !== 'active' ? ' · ' + m.status.toUpperCase() : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
