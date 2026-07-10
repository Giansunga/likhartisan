const FINISH_LABELS: Record<string, string> = {
  raw_clay: 'Raw Clay',
  matte: 'Matte',
  ceramic: 'Ceramic',
  glazed: 'Glazed',
  metallic: 'Metallic',
};

export default function DesignMessageCard({ data }: { data: { design?: any } }) {
  const design = data.design;
  if (!design) return null;

  const shape = design.shape || {};
  const material = design.material || {};
  const decor = design.decor || {};
  const finish = FINISH_LABELS[material.finish] || material.finish || 'Clay';

  return (
    <div className="chat-product-card" style={{ cursor: 'default', pointerEvents: 'none' }}>
      <div
        className="chat-product-img"
        style={{
          background: material.color || '#C4A882',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ width: '28px', height: '28px', opacity: 0.9 }}>
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" />
        </svg>
      </div>
      <div className="chat-product-info">
        <span className="chat-product-name">{design.model || 'Custom Design'}</span>
        <span className="chat-product-variant">
          {finish} · H {shape.height ?? '—'}cm · W {shape.bodyWidth ?? '—'}cm
        </span>
        <span className="chat-product-variant">
          Decor: {decor.text || 'None'}
        </span>
      </div>
    </div>
  );
}
