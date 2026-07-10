import { useState } from 'react';

interface InteractiveMapProps {
  address: string;
  onAddressChange: (address: string) => void;
  height?: number;
}

export default function InteractiveMap({ address, onAddressChange, height = 220 }: InteractiveMapProps) {
  const [editMode, setEditMode] = useState(false);
  const [manualAddress, setManualAddress] = useState(address);

  return (
    <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #E8E0D8' }}>
      {editMode ? (
        <div style={{ padding: '12px' }}>
          <input
            value={manualAddress}
            onChange={e => setManualAddress(e.target.value)}
            placeholder="Enter your full address"
            style={{
              width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8',
              borderRadius: '8px', fontSize: '0.85rem', fontFamily: 'var(--font-sans)',
              boxSizing: 'border-box', outline: 'none', marginBottom: '8px',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setEditMode(false)} style={{
              padding: '6px 14px', border: '1px solid #E8E0D8', borderRadius: '6px',
              background: '#fff', color: '#666', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
            }}>Cancel</button>
            <button onClick={() => { onAddressChange(manualAddress); setEditMode(false); }} style={{
              padding: '6px 14px', border: 'none', borderRadius: '6px',
              background: 'var(--primary-color)', color: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
            }}>Set Address</button>
          </div>
        </div>
      ) : (
        <>
          {address ? (
            <iframe
              title="Shipping Location"
              width="100%"
              height={height}
              style={{ border: 0, display: 'block' }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed&z=15`}
            />
          ) : (
            <div style={{
              height: `${height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#FAFAFA', color: '#999', fontSize: '0.85rem', fontFamily: 'var(--font-sans)',
            }}>
              No address set
            </div>
          )}
          <div style={{
            padding: '6px 12px', background: '#FAFAFA', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.72rem', color: '#999', fontFamily: 'var(--font-sans)' }}>
              {address || 'No location set'}
            </span>
            <button onClick={() => { setManualAddress(address); setEditMode(true); }} style={{
              background: 'none', border: 'none', color: 'var(--primary-color)',
              fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              Change
            </button>
          </div>
        </>
      )}
    </div>
  );
}
