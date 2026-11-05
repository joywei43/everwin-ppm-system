import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TableState } from './App';
const API = ((import.meta as any).env.VITE_API_URL || 'https://everest-waiting-api.drumsjw47.workers.dev').replace(/\/$/, '');
export function useCloudTables(initial: () => TableState[]) {
  const [tables, putTables] = useState<TableState[]>(initial);
  const current = useRef(tables), version = useRef(0), locked = useRef(false);
  const refreshing = useRef<Promise<void> | null>(null);
  const [token, setToken] = useState(() => sessionStorage.getItem('ppm-session') || '');
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  // Result of copying finished sessions to the member system, shown to staff right after Leave.
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSync = (sync: any) => {
    if (!sync) return;
    let next: { kind: 'ok' | 'warn' | 'error'; text: string } | null = null;
    if (sync.error) next = { kind: 'error', text: `會員系統未更新 · Not recorded: ${sync.error} — 5 分鐘內會自動重試 (retries automatically)` };
    else if (sync.inserted && Array.isArray(sync.sessions)) {
      const lost = sync.sessions.filter((x: any) => !x.member_no);
      next = { kind: lost.length ? 'warn' : 'ok', text: '已寫入會員系統 · Recorded: ' + sync.sessions.map((x: any) => `${x.ref} → ${x.member_no || '未對應會員 (link in Unmatched PPM)'}`).join(' · ') };
    }
    if (!next) return;
    setNotice(next);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), next.kind === 'ok' ? 8000 : 20000);
  };
  const receive = useCallback((data: any) => {
    version.current = data.version;
    current.current = data.tables.length ? data.tables : initial();
    putTables(current.current);
  }, []);
  const request = async (path: string, method = 'GET', body?: unknown, auth = token) => {
    const res = await fetch(API + path, {method, headers: {'Content-Type':'application/json', ...(auth ? {Authorization:'Bearer '+auth}: {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) { sessionStorage.removeItem('ppm-session'); setToken(''); setReady(false); }
      throw new Error(data.error || 'Connection failed');
    }
    return data;
  };
  useEffect(() => {
    if (!token) return;
    let disposed = false;
    async function refresh() {
      if (locked.current || refreshing.current) return;
      try { const data = await request('/ppm'); if (!disposed) { receive(data); setReady(true); setMessage(data.version ? 'Connected · Live Update synced' : 'Connected · Start a table to publish PPM tables'); } }
      catch (e) { if (!disposed) setMessage(String((e as Error).message)); }

    }
    const poll = () => { if (locked.current || refreshing.current) return; refreshing.current = refresh().finally(()=>{refreshing.current=null;}); };
    poll(); const id = window.setInterval(poll, 3000);
    return () => { disposed = true; clearInterval(id); };
  }, [token, receive]);
  const setTables: React.Dispatch<React.SetStateAction<TableState[]>> = (change) => {
    if (locked.current) { setMessage('Sync in progress. Please retry.'); return; }
    locked.current = true; setBusy(true); setMessage('Saving…');
    (async () => {
      try {
        if (refreshing.current) await refreshing.current;
        const next = typeof change === 'function' ? change(current.current) : change;
        const data = await request('/ppm','PUT',{version:version.current,tables:next});
        receive(data); setMessage('Saved · Live Update synced'); showSync(data.sync);
      } catch(e) {
        setMessage((e as Error).message); try {receive(await request('/ppm'));} catch {}
      } finally {locked.current=false;setBusy(false);}
    })();
  };
  const login = async (username: string, password: string) => {
    setBusy(true);
    try { const data = await request('/login','POST',{username:username.trim(),password},'');sessionStorage.setItem('ppm-session',data.token);if(data.user)sessionStorage.setItem('ppm-user',data.user);setToken(data.token);setMessage('Connecting…'); }
    catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  };
  const logout = async () => {try {await request('/logout','POST',{});}finally{sessionStorage.removeItem('ppm-session');sessionStorage.removeItem('ppm-user');setToken('');setReady(false);}};
  return {tables,setTables,ready,busy,message,notice,login,logout};
}
export function CloudLogin({cloud}:{cloud:ReturnType<typeof useCloudTables>}) {
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  return <main style={{maxWidth:420,margin:'60px auto',padding:24}}><h1>Everwin PPM</h1><p>Staff sign in</p><form style={{display:'grid',gap:10}} onSubmit={e=>{e.preventDefault();cloud.login(username,password);}}><label>Username <input aria-label="Username" autoComplete="username" autoCapitalize="off" spellCheck={false} maxLength={60} value={username} onChange={e=>setUsername(e.target.value)} required/></label><label>Password <input aria-label="Password" type="password" autoComplete="current-password" maxLength={200} value={password} onChange={e=>setPassword(e.target.value)} required/></label><button disabled={cloud.busy}>Sign in</button></form><p role="alert">{cloud.message}</p></main>;
}

export interface MemberHit { member_no: string; name: string; nickname: string; nick_label?: string; nationality?: string; group_name: string | null; status: string; }
// Member lookup for the seat input. Returns [] on any error so typing never breaks PPM.
export async function searchMembers(q: string): Promise<MemberHit[]> {
  const token = sessionStorage.getItem('ppm-session');
  if (!token || !q.trim()) return [];
  try {
    const res = await fetch(API + '/members?limit=6&q=' + encodeURIComponent(q.trim()), { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.members) ? data.members : [];
  } catch { return []; }
}

export interface MemberBrief { member_no: string; nickname: string; name: string; nationality?: string; status?: string; }
// Is the typed name a member? Returns null when the check cannot run (offline), so seating never gets stuck.
export async function resolveMember(ref: string): Promise<{ member: MemberBrief | null; suggestions: MemberBrief[] } | null> {
  const token = sessionStorage.getItem('ppm-session');
  if (!token || !ref.trim()) return null;
  try {
    const res = await fetch(API + '/members/resolve?ref=' + encodeURIComponent(ref.trim()), { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    const j = await res.json();
    return j && Array.isArray(j.suggestions) ? j : null;
  } catch { return null; }
}
// Before closing a table: players not matched to a member and sessions without a cash-out.
export async function closeCheck(table: string): Promise<{ unmatched: { seat: number; ref: string; left: boolean }[]; missing_cash_out: { seat: number; ref: string }[] } | null> {
  const token = sessionStorage.getItem('ppm-session');
  if (!token) return null;
  try {
    const res = await fetch(API + '/sessions/close-check?table=' + encodeURIComponent(table), { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    const j = await res.json();
    return j && Array.isArray(j.unmatched) && Array.isArray(j.missing_cash_out) ? j : null;
  } catch { return null; }
}
// Member photos for the seat cards (cached; null when the member has no photo).
const photoCache = new Map<string, Promise<string | null>>();
export function memberPhoto(no: string): Promise<string | null> {
  const token = sessionStorage.getItem('ppm-session');
  if (!token) return Promise.resolve(null);
  if (!photoCache.has(no)) {
    photoCache.set(no, fetch(API + '/members/' + encodeURIComponent(no) + '/photo', { headers: { Authorization: 'Bearer ' + token } })
      .then(async (r) => (r.ok ? (await r.json()).data || null : null)).catch(() => null));
  }
  return photoCache.get(no)!;
}
