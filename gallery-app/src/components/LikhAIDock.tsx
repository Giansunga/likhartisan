import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import LikhAIConversation from './chat/LikhAIConversation';

export default function LikhAIDock() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || window.innerWidth > 480) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  return (
    <>
      {open ? (
        <aside className="likhai-dock" aria-label="LikhAI customer support">
          <header className="likhai-dock__header">
            <img className="likhai-dock__brand-icon" src="/images/likhai-logo.png" alt="" />
            <div className="likhai-dock__brand-copy">
              <strong>LikhAI</strong>
              <span>Customer Support</span>
            </div>
            <Link to="/likhai" title="Open full page" aria-label="Open LikhAI full page">↗</Link>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close LikhAI">×</button>
          </header>
          <LikhAIConversation compact autoFocus />
        </aside>
      ) : (
        <button className="likhai-launcher" type="button" onClick={() => setOpen(true)} aria-label="Open LikhAI customer support">
          <img src="/images/likhai-logo.png" alt="" /><span><strong>LikhAI</strong><small>Customer Support</small></span>
        </button>
      )}
      <style>{`
        .likhai-launcher { position: fixed; right: 16px; bottom: 16px; z-index: 9999; min-height: 44px; display: flex; align-items: center; gap: 5px; border: 0; border-radius: 999px; padding: 4px 9px 4px 5px; background: linear-gradient(135deg,#823e0b,#a85a22); color: #fff; box-shadow: 0 4px 16px rgba(130,62,11,.3); cursor: pointer; animation: likhai-enter .25s ease-out; }
        .likhai-launcher img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
        .likhai-launcher span { display: flex; flex-direction: column; text-align: left; font-size: .78rem; line-height: 1.1; } .likhai-launcher small { font-size: .58rem; opacity: .78; }
        .likhai-dock { position: fixed; right: 20px; bottom: 0; z-index: 10000; width: 360px; height: 560px; max-height: calc(100vh - 30px); display: flex; flex-direction: column; overflow: hidden; border-radius: 18px 18px 0 0; background: #fff; box-shadow: 0 10px 42px rgba(0,0,0,.2); animation: likhai-enter .25s ease-out; }
        .likhai-dock__header { display: flex; align-items: center; gap: 9px; padding: 12px 13px; color: #fff; background: linear-gradient(135deg,#823e0b,#a85a22); }
        .likhai-dock__brand-icon { width: 36px; height: 36px; flex: 0 0 36px; border-radius: 11px; object-fit: cover; }
        .likhai-dock__brand-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; line-height: 1.15; }
        .likhai-dock__brand-copy span { margin-top: 2px; font-size: .7rem; opacity: .82; }
        .likhai-dock__header a, .likhai-dock__header button { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: rgba(255,255,255,.16); color: #fff; text-decoration: none; cursor: pointer; font-size: 1.1rem; }
        @media (max-width:768px) { .likhai-launcher { bottom: calc(var(--mobile-nav-reserved-height) + 10px); right: 12px; } }
        @media (max-width:480px) { .likhai-dock { inset: 0; width: 100vw; height: 100vh; max-height: none; border-radius: 0; } }
      `}</style>
    </>
  );
}
