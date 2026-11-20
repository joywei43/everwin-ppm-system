// Waiting list kept by the waiting-list worker: one queue per game ("50 / 100 NLH"), plus the player each game is calling now.
export const WAIT_API = 'https://everest-waiting-api.drumsjw47.workers.dev';
export interface WaitEntry { num: number; name: string; game: string; member_no?: string }
export interface WaitState { queue: WaitEntry[]; calls: Record<string, WaitEntry>; counters: Record<string, number> }
export interface WaitRoom { version: number; state: WaitState }

export const gameOf = (t: { blinds: string; gameType: string }) => `${String(t.blinds || '').trim()} ${String(t.gameType || '').trim()}`;
// The member number in "Nickname (000065)", or null.
export const memberNoOf = (name: string) => { const m = /\((?:EV-)?(\d{6})\)\s*$/i.exec(String(name || '')); return m ? m[1] : null; };
// Same player: same member number, or the same name when there is no number.
export const samePlayer = (a: string, b: string) => { const x = memberNoOf(a), y = memberNoOf(b); return x && y ? x === y : a.trim().toLowerCase() === b.trim().toLowerCase(); };

export async function loadWait(): Promise<WaitRoom> {
  const r = await fetch(WAIT_API + '/state');
  if (!r.ok) throw Error('Cannot load waiting list');
  return r.json();
}
// Change the list and save; on a version clash (another device saved first) load again and retry once.
export async function saveWait(change: (s: WaitState) => boolean | void, room?: WaitRoom): Promise<WaitRoom> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cur = attempt === 0 && room ? room : await loadWait();
    const state: WaitState = structuredClone(cur.state);
    if (change(state) === false) return cur;
    const r = await fetch(WAIT_API + '/state', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionStorage.getItem('ppm-session') }, body: JSON.stringify({ version: cur.version, state }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return loadWait();
    if (r.status !== 409 || attempt === 1) throw Error((d as any).error || 'Save failed');
  }
  return loadWait();
}

// A player sat down: take them off every waiting list and clear the call if they were being called.
export async function removeSeated(names: string[]): Promise<void> {
  if (!names.length) return;
  const room = await loadWait();
  const hit = (n: string) => names.some((x) => samePlayer(x, n));
  if (!room.state.queue.some((p) => hit(p.name)) && !Object.values(room.state.calls || {}).some((c) => c && hit(c.name))) return;
  await saveWait((s) => {
    s.queue = s.queue.filter((p) => !hit(p.name));
    for (const [g, c] of Object.entries(s.calls || {})) if (c && hit(c.name)) delete s.calls[g];
  }, room);
}

// Who to tell when a seat opens for this game: the player being called, else the first in line.
export async function nextFor(game: string): Promise<WaitEntry | null> {
  const s = (await loadWait()).state;
  if (s.calls?.[game]) return s.calls[game];
  return s.queue.filter((p) => p.game === game).sort((a, b) => a.num - b.num)[0] || null;
}
