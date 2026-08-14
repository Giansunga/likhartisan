import LikhAIConversation from '../components/chat/LikhAIConversation';

export default function ChatbotPage() {
  return (
    <main className="likhai-page">
      <header className="likhai-page__header">
        <img src="/images/likhai-logo.png" alt="" />
        <div><h1>LikhAI</h1><p>Grounded LikhArtisan customer support</p></div>
      </header>
      <LikhAIConversation autoFocus />
      <p className="likhai-page__disclaimer">LikhAI is read-only. Verify important order details in My Purchases or with the seller.</p>
      <style>{`
        .likhai-page { height: calc(100vh - var(--nav-height)); margin-top: var(--nav-height); display: flex; flex-direction: column; background: #faf8f5; }
        .likhai-page__header { display: flex; align-items: center; gap: 12px; padding: 14px max(20px, calc((100vw - 800px)/2)); background: #fff; border-bottom: 1px solid #e8e0d8; }
        .likhai-page__header img { width: 44px; height: 44px; border-radius: 13px; object-fit: cover; }
        .likhai-page__header h1 { margin: 0; font-size: 1.15rem; font-family: var(--font-serif); }
        .likhai-page__header p, .likhai-page__disclaimer { margin: 2px 0 0; color: var(--text-light); font-size: .76rem; }
        .likhai-page__disclaimer { margin: 0; padding: 7px 15px; text-align: center; background: #fff; border-top: 1px solid #eee5dc; }
      `}</style>
    </main>
  );
}
