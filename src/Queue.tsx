import React, { useEffect, useState } from 'react';
import MemberInput from './MemberInput';
import { resolveMember } from './cloud';
import { loadWait, saveWait, samePlayer, WaitRoom } from './waitlist';

// Waiting list for the floor: only existing members can be added (picked from the member list),
// and a player who is already waiting or seated cannot be added twice.
export default function Queue({ seated = [] }: { seated?: string[] }) {
  const [room, setRoom] = useState<WaitRoom | null>(null), [game, setGame] = useState('50 / 100 NLH'), [name, setName] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const load = async () => { const d = await loadWait(); setRoom(d); return d; };
  useEffect(() => { load().catch((e) => setMessage(e.message)); const id = setInterval(() => load().catch(() => {}), 5000); return () => clearInterval(id); }, []);
  const save = async (change: Parameters<typeof saveWait>[0], ok = 'Waiting list saved') => {
    if (busy || !room) return; setBusy(true);
    try { setRoom(await saveWait(change, room)); setMessage(ok); } catch (e) { setMessage((e as Error).message); await load().catch(() => {}); } finally { setBusy(false); }
  };
  const add = async () => {
    const typed = name.trim(); if (!typed || busy) return;
    setBusy(true); let r: Awaited<ReturnType<typeof resolveMember>> = null;
    try { r = await resolveMember(typed); } finally { setBusy(false); }
    if (!r) { setMessage('Cannot check the member list right now. Try again.'); return; }
    if (!r.member) { setMessage(`"${typed}" is not a member. Pick a member from the list (type a name or member number).`); return; }
    const no = r.member.member_no.replace(/^EV-/i, ''), label = `${(r.member.nickname || r.member.name || no).trim().slice(0, 45)} (${no})`;
    if (seated.some((x) => samePlayer(x, label))) { setMessage(`${label} is already seated at a table.`); return; }
    const s = room!.state;
    const dup = s.queue.find((p) => samePlayer(p.name, label)) || Object.values(s.calls || {}).find((c) => c && samePlayer(c.name, label));
    if (dup) { setMessage(`${label} is already waiting (#${dup.num} ${dup.game}).`); return; }
    await save((st) => { if (st.queue.some((p) => samePlayer(p.name, label))) return false; st.queue.push({ num: st.counters[game]++, name: label, member_no: no, game }); }, `${label} added to ${game}`);
    setName('');
  };
  if (!room) return <p>{message || 'Loading waiting list…'}</p>;
  const s = room.state, waiting = s.queue.filter((p) => p.game === game).sort((a, b) => a.num - b.num), called = s.calls[game];
  return <section style={{ padding: 24, background: '#fff', color: '#123', marginTop: 20 }}><h2>Waiting list & calls</h2>
    <fieldset disabled={busy} style={{ border: 0 }}>
      <select aria-label="Queue game" value={game} onChange={(e) => setGame(e.target.value)}>{Object.keys(s.counters).map((g) => <option key={g}>{g}</option>)}</select>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 6 }}>
        <div style={{ width: 260 }}><MemberInput value={name} disabled={busy} placeholder="Member name or number" onChange={(e) => setName(e.target.value)} /></div>
        <button disabled={!name.trim()}>Add to queue</button>
      </form>
      <p>Current call: {called ? '#' + called.num + ' ' + called.name : '—'}</p>
      <button disabled={!!called || !waiting.length} onClick={() => save((st) => { st.calls[game] = waiting[0]; st.queue = st.queue.filter((p) => !(p.game === game && p.num === waiting[0].num)); })}>Call next</button>
      <button disabled={!called} onClick={() => save((st) => { delete st.calls[game]; })}>Clear call / no-show</button>
      <p>Seat the called player in the PPM seat panel: they come off the waiting list by themselves.</p>
      <ol>{waiting.map((p) => <li key={p.num}>#{p.num} {p.name} <button onClick={() => { if (window.confirm(`Remove #${p.num} ${p.name} from the waiting list?`)) save((st) => { st.queue = st.queue.filter((x) => !(x.game === game && x.num === p.num)); }); }}>Remove</button></li>)}</ol>
      <p role="status">{message}</p>
    </fieldset></section>;
}
