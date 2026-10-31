// Pure notification rules. No credentials or Telegram calls belong here.
export const IDS = ['T1', 'T2', 'T3', 'T5'];
export const THANK_YOU = `THANK YOU FOR PLAYING AT EVEREST POKER! ♠️
A huge thank you to all our players who joined us and made tonight’s action exciting! 🔥
We truly appreciate your support and the great energy at the tables. 🙌
See you again for more big hands, big action, and great poker moments! 🃏`;
export function readTables(state) {
  if (!state || !Array.isArray(state.tableOpen) || state.tableOpen.length !== 4) throw new Error('Missing PPM table state');
  return IDS.map((id, i) => {
    const seats = state.occupied?.[i], game = state.tableTypes?.[i], stakes = state.games?.[i];
    if (typeof state.tableOpen[i] !== 'boolean' || !Array.isArray(seats) || seats.length !== 9 || !seats.every(v => [0, 1, true, false].includes(v)) || !['NLH','PLO','Others'].includes(game) || typeof stakes !== 'string') throw new Error('Invalid PPM table state');
    return { id, open: state.tableOpen[i], players: seats.filter(Boolean).length, game, stakes: stakes.replace(/\s/g, ''), capacity: 9 };
  });
}

// Commit the returned state only after the corresponding notification is accepted.
// A caller must serialize transitions and persist state across restarts.
export function transition(previous = {}, tables, now) {
  const before = previous.tables || [];
  const pending = new Set(previous.pending || []);
  const ready = new Set(previous.ready || []);
  const newlyReady = [], increases = [], full = [];
  for (const t of tables) {
    const old = before.find(x => x.id === t.id);
    if (!t.open) { pending.delete(t.id); ready.delete(t.id); continue; }
    if (!old?.open) { pending.add(t.id); ready.delete(t.id); }
    if (pending.has(t.id) && t.players >= 5) {
      pending.delete(t.id); ready.add(t.id); newlyReady.push(t.id);
      if (t.players === t.capacity) full.push(t.id);
    } else if (ready.has(t.id) && old?.open && t.players > old.players && t.players >= 5) {
      increases.push(t.id);
      if (t.players === t.capacity) full.push(t.id);
    }
  }
  const active = tables.some(t => t.open);
  const publishable = tables.some(t => t.open && t.players >= 5);
  const local = new Date((now + 8 * 3600) * 1000);
  const closingDay = local.toISOString().slice(0, 10);
  const lastTableClosed = before.some(t => t.open) && !active;
  const thankYou = lastTableClosed && local.getUTCHours() >= 4 && previous.thankedDay !== closingDay;
  const groupDue = publishable && (newlyReady.length > 0 || (previous.groupAt != null && now - previous.groupAt >= 3600));
  const channelDue = publishable && (newlyReady.length > 0 || increases.length > 0 || (previous.channelAt != null && now - previous.channelAt >= 1800));
  return {
    // Common event, delivered once to each distinct configured destination.
    common: thankYou ? { reason: 'last-table-closed', key: `thanks:${closingDay}`, text: THANK_YOU } : null,
    group: groupDue ? { reason: newlyReady.length ? 'new-table' : 'periodic', tables: newlyReady } : null,
    channel: channelDue ? { reason: full.length ? 'full' : newlyReady.length ? 'new-table' : increases.length ? 'increase' : 'periodic', tables: [...newlyReady, ...increases], full } : null,
    state: { tables, pending: [...pending], ready: [...ready], groupAt: groupDue ? now : previous.groupAt ?? null, channelAt: channelDue ? now : previous.channelAt ?? null, thankedDay: thankYou ? closingDay : previous.thankedDay ?? null }
  };
}

export function message(tables, now, { filter = 'all', full = [], minPlayers = 0 } = {}) {
  const date = new Date(now * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type,p.value]));
  const lines = ['EVEREST POKER LIVE TABLES', `TIME: ${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`, ''];
  const selected = tables.filter(t => t.open && t.players >= minPlayers && (filter === 'all' || t.game === filter));
  for (const t of selected) {
    lines.push(`${t.id} · ${t.game} ${t.stakes} · ${t.players}/${t.capacity} players${full.includes(t.id) ? ' · TABLE FULL' : ''}`);
  }
  if (!selected.length) lines.push('No tables currently open.');
  if (selected.some(t => full.includes(t.id) && !tables.some(other => other.id !== t.id && other.open && other.game === t.game && other.stakes === t.stakes))) lines.push('Reservations are now open for a second table.');
  lines.push('', 'https://www.everestpokerroom.com/waiting-list/', 'Contact : @midoripokerroom to reserve your seat');
  return lines.join('\n');
}
