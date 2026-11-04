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
  // A closure before 04:00 persists until the first successful poll at/after 04:00.
  let pendingThanksDay = previous.pendingThanksDay === closingDay ? closingDay : null;
  if (active) pendingThanksDay = null;
  else if (lastTableClosed) pendingThanksDay = closingDay;
  const thankYou = !active && pendingThanksDay === closingDay && local.getUTCHours() >= 4 && previous.thankedDay !== closingDay;
  if (thankYou || previous.thankedDay === closingDay) pendingThanksDay = null;
  const groupDue = publishable && (newlyReady.length > 0 || (previous.groupAt != null && now - previous.groupAt >= 3600));
  const channelDue = publishable && (newlyReady.length > 0 || increases.length > 0 || (previous.channelAt != null && now - previous.channelAt >= 1800));
  return {
    // Common event, delivered once to each distinct configured destination.
    common: thankYou ? { reason: 'last-table-closed', key: `thanks:${closingDay}`, text: THANK_YOU } : null,
    group: groupDue ? { reason: newlyReady.length ? 'new-table' : 'periodic', tables: newlyReady } : null,
    channel: channelDue ? { reason: full.length ? 'full' : newlyReady.length ? 'new-table' : increases.length ? 'increase' : 'periodic', tables: [...newlyReady, ...increases], full } : null,
    state: { tables, pendingThanksDay, pending: [...pending], ready: [...ready], groupAt: groupDue ? now : previous.groupAt ?? null, channelAt: channelDue ? now : previous.channelAt ?? null, thankedDay: thankYou ? closingDay : previous.thankedDay ?? null }
  };
}

export function message(tables, now, { filter = 'all', full = [], minPlayers = 0, periodic = false } = {}) {
  const date = new Date(now * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type,p.value]));
  const lines = ['EVEREST POKER LIVE TABLES', `TIME: ${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`, ''];
  const selected = tables.filter(t => t.open && t.players >= minPlayers && (filter === 'all' || t.game === filter));
  if (periodic) {
    const games = new Map();
    for (const table of selected) {
      const game = `${table.stakes.replace(/\//g, '-')} ${table.game}`;
      games.set(game, (games.get(game) ?? 0) + 1);
    }
    return [
      '🔥 THE ACTION IS ON AT EVEREST POKER! 🃏🔥',
      'Check our Latest Update on website:',
      'https://www.everestpokerroom.com/waiting-list/',
      '',
      ...Array.from(games, ([game, count]) => `${count} ${count === 1 ? 'TABLE' : 'TABLES'} ONGOING – ${game}`),
      '👥 Current Lineup:',
      ...selected.flatMap(table => {
        const seats = table.capacity - table.players;
        return [
          '',
          `TABLE ${table.id.slice(1)} ${table.stakes.replace(/\//g, '-')} ${table.game}`,
          '',
          ...(table.nationalities?.some(row => row.nationality) ? table.nationalities.map(({nationality, count}) => {
            const player = count === 1 ? 'Player' : 'Players';
            return nationality ? `${count} ${nationality} ${player}` : `${count} ${player} (nationality not recorded)`;
          }) : [`${table.players} Players Seated`]),
          `(${seats} ${seats === 1 ? 'SEAT' : 'SEATS'} OPEN)`,
        ];
      }),
      '',
      '🔥 Reserve your seat, players!',
      'Come join the action at Everest Poker! 🃏♠️❤️♣️',
      'Contact: @midoripokerroom',
    ].join('\n');
  }
  for (const t of selected) {
    lines.push(`${t.id} · ${t.game} ${t.stakes} · ${t.players}/${t.capacity} players${full.includes(t.id) ? ' · TABLE FULL' : ''}`);
  }
  if (!selected.length) lines.push('No tables currently open.');
  if (selected.some(t => full.includes(t.id) && !tables.some(other => other.id !== t.id && other.open && other.game === t.game && other.stakes === t.stakes))) lines.push('Reservations are now open for a second table.');
  lines.push('', 'https://www.everestpokerroom.com/waiting-list/', 'Contact : @midoripokerroom to reserve your seat');
  return lines.join('\n');
}


export function dailyInvitation(time) {
  const local = new Date((time + 8 * 3600) * 1000);
  // Catch a missed 16:00 tick during the same hour, without sending late-night catch-ups.
  if (local.getUTCHours() !== 16) return null;
  return {
    day: local.toISOString().slice(0, 10),
    text: `♠️ POKER TONIGHT AT EVEREST!

Get ready for tonight’s poker action! Join us at Everest Poker Room, Midori Clark, 2F.

Bring your friends and enjoy a great night at the tables!

Telegram: @MIDORIPOKER
Contact us for game details and seat reservations.
https://www.everestpokerroom.com/waiting-list/`
  };
}
