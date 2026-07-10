import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Model3D {
  id: string;
  name: string;
  category: string;
  file_url: string;
  thumbnail: string;
  created_at: string;
}

export default function ModelTab({
  selectedModel,
  onSelect,
}: {
  selectedModel: string;
  onSelect: (file: string, name: string, category: string, thumbnail: string) => void;
}) {
  const [models, setModels] = useState<Model3D[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('models_3d')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setModels(data);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h3 className="freeform-tab-heading">Model Selection</h3>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Loading models...
        </div>
      ) : models.length === 0 ? (
        <div className="freeform-tab-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" style={{ width: '40px', height: '40px', margin: '0 auto 8px' }}>
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" />
          </svg>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No models available</p>
          <p style={{ color: 'var(--text-light)', fontSize: '0.75rem', marginTop: '4px' }}>Ask an admin to upload models first</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => onSelect(model.file_url, model.name, model.category, model.thumbnail || '')}
              className={`freeform-tab-option${selectedModel === model.file_url ? ' selected' : ''}`}
            >
              <div style={{
                width: '48px', height: '48px', borderRadius: '12px', overflow: 'hidden',
                background: 'var(--bg-tertiary)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {model.thumbnail ? (
                  <img src={model.thumbnail} alt={model.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ width: '20px', height: '20px' }}>
                    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" />
                  </svg>
                )}
              </div>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)', display: 'block' }}>{model.name}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{model.category}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
