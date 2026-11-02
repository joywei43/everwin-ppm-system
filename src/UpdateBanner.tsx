import React, { useEffect, useState } from 'react';

// Checks every minute whether a newer PPM build has been published and offers a one-tap reload.
// Table data lives in the cloud and the sign-in survives a reload, so reloading is safe.
const current = () => (typeof document === 'undefined' || typeof fetch === 'undefined') ? '' : (document.querySelector('script[type="module"][src*="assets/index-"]') as HTMLScriptElement | null)?.getAttribute('src') || '';

export default function UpdateBanner(props: { lang: 'zh' | 'en' }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const mine = current();
    if (!mine) return;
    const check = async () => {
      try {
        const html = await (await fetch('./?v=' + Date.now(), { cache: 'no-store' })).text();
        const m = /src="([^"]*assets\/index-[^"]+\.js)"/.exec(html);
        if (m && m[1] !== mine) setReady(true);
      } catch { /* offline: try again later */ }
    };
    const id = setInterval(check, 60000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, []);
  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      {props.lang === 'zh' ? 'PPM 有新版本。' : 'A new version of PPM is available.'}
      <button type="button" onClick={() => location.reload()}>{props.lang === 'zh' ? '立即更新' : 'Update now'}</button>
    </div>
  );
}
