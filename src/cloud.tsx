import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TableState } from './App';
const API = ((import.meta as any).env.VITE_API_URL || 'https://everest-waiting-api.drumsjw47.workers.dev').replace(/\/$/, '');
export function useCloudTables(initial: () => TableState[]) {
  const [tables, putTables] = useState<TableState[]>(initial);
  const current = useRef(tables), version = useRef(0), locked = useRef(false);
  const refreshing = useRef<Promise<void> | null>(null);
  const [token, setToken] = useState(() => sessionStorage.getItem('ppm-session') || '');
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
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
        receive(data); setMessage('Saved · Live Update synced');
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
  return {tables,setTables,ready,busy,message,login,logout};
}
export function CloudLogin({cloud}:{cloud:ReturnType<typeof useCloudTables>}) {
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  return <main style={{maxWidth:420,margin:'60px auto',padding:24}}><h1>Everwin PPM</h1><p>Staff sign in</p><form style={{display:'grid',gap:10}} onSubmit={e=>{e.preventDefault();cloud.login(username,password);}}><label>Username <input aria-label="Username" autoComplete="username" autoCapitalize="off" spellCheck={false} maxLength={60} value={username} onChange={e=>setUsername(e.target.value)} required/></label><label>Password <input aria-label="Password" type="password" autoComplete="current-password" maxLength={200} value={password} onChange={e=>setPassword(e.target.value)} required/></label><button disabled={cloud.busy}>Sign in</button></form><p role="alert">{cloud.message}</p></main>;
}

export interface MemberHit { member_no: string; name: string; nickname: string; group_name: string | null; status: string; }
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
