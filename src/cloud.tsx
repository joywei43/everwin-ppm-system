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
  const login = async (password: string) => {
    setBusy(true);
    try { const data = await request('/login','POST',{username:'admin01',password},'');sessionStorage.setItem('ppm-session',data.token);setToken(data.token);setMessage('Connecting…'); }
    catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  };
  const logout = async () => {try {await request('/logout','POST',{});}finally{sessionStorage.removeItem('ppm-session');setToken('');setReady(false);}};
  return {tables,setTables,ready,busy,message,login,logout};
}
export function CloudLogin({cloud}:{cloud:ReturnType<typeof useCloudTables>}) {
  const [password,setPassword]=useState('');
  return <main style={{maxWidth:420,margin:'60px auto',padding:24}}><h1>Everwin PPM</h1><p>Staff sign in · admin01</p><form onSubmit={e=>{e.preventDefault();cloud.login(password);}}><input aria-label="Password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/><button disabled={cloud.busy}>Sign in</button></form><p role="alert">{cloud.message}</p></main>;
}
