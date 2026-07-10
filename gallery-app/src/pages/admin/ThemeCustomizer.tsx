import { useTheme, THEMES, type ThemeName } from '../../contexts/ThemeContext';

const THEME_DESCRIPTIONS: Record<ThemeName, string> = {
  default: 'The classic LikhArtisan earthy tones',
  christmas: 'Festive reds and greens for the holiday season',
  valentines: 'Romantic reds and pinks for love season',
  'holy-week': 'Solemn purples for the sacred week',
  'mothers-day': 'Soft pinks honoring all mothers',
  'fathers-day': 'Bold blues celebrating all fathers',
};

export default function ThemeCustomizer() {
  const { currentTheme, autoDetect, setTheme, setAutoDetect, loading } = useTheme();

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#929090' }}>Loading theme settings...</div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>
          Theme Customizer
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#929090' }}>
          Customize the look and feel of the entire site for different occasions.
        </p>
      </div>

      {/* Auto-detect Toggle */}
      <div style={{
        background: '#fff', border: '1px solid #E8E0D8', borderRadius: '12px',
        padding: '20px 24px', marginBottom: '24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-dark)', marginBottom: '2px' }}>
            Auto-detect by Date
          </div>
          <div style={{ fontSize: '0.82rem', color: '#929090' }}>
            Automatically switch themes based on the current date (Christmas in December, Valentine's in Feb, etc.)
          </div>
        </div>
        <button
          onClick={() => setAutoDetect(!autoDetect)}
          style={{
            width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer',
            background: autoDetect ? 'var(--primary-color)' : '#D4C8BB',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}
        >
          <div style={{
            width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
            position: 'absolute', top: '3px',
            left: autoDetect ? '27px' : '3px',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>

      {/* Theme Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px',
      }}>
        {(Object.keys(THEMES) as ThemeName[]).map((name) => {
          const t = THEMES[name];
          const isActive = currentTheme === name;
          return (
            <button
              key={name}
              onClick={() => setTheme(name)}
              style={{
                background: '#fff', border: isActive ? '2px solid var(--primary-color)' : '1px solid #E8E0D8',
                borderRadius: '14px', padding: '0', cursor: 'pointer', textAlign: 'left',
                overflow: 'hidden', transition: 'all 0.2s',
                boxShadow: isActive ? '0 4px 16px rgba(130,62,11,0.15)' : 'none',
                position: 'relative',
              }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute', top: '12px', right: '12px', width: '28px', height: '28px',
                  borderRadius: '50%', background: 'var(--primary-color)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.85rem', fontWeight: 700, zIndex: 2,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
              )}

              {/* Color Preview Bar */}
              <div style={{ display: 'flex', height: '8px' }}>
                <div style={{ flex: 1, background: t.colors.primary }} />
                <div style={{ flex: 1, background: t.colors.accent }} />
                <div style={{ flex: 1, background: t.colors.bgSecondary }} />
              </div>

              {/* Card Content */}
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-dark)' }}>{t.label}</div>
                    {name === 'default' && (
                      <div style={{ fontSize: '0.72rem', color: '#929090', fontWeight: 500 }}>Current default</div>
                    )}
                  </div>
                </div>

                <p style={{ fontSize: '0.82rem', color: '#929090', lineHeight: 1.4, margin: '0 0 14px' }}>
                  {THEME_DESCRIPTIONS[name]}
                </p>

                {/* Color Swatches */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { color: t.colors.primary, label: 'Primary' },
                    { color: t.colors.accent, label: 'Accent' },
                    { color: t.colors.bg, label: 'Background' },
                    { color: t.colors.bgSecondary, label: 'Secondary' },
                    { color: t.colors.text, label: 'Text' },
                  ].map((swatch) => (
                    <div key={swatch.label} title={swatch.label} style={{ textAlign: 'center' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '6px',
                        background: swatch.color, border: '1px solid rgba(0,0,0,0.08)',
                      }} />
                    </div>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Theme Info */}
      <div style={{
        marginTop: '28px', padding: '20px 24px', background: '#FDF5ED',
        borderRadius: '12px', border: '1px solid #E8E0D8',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div>
            <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
              {THEMES[currentTheme].label}
            </span>
            <span style={{ color: '#929090', fontSize: '0.88rem' }}>
              {' '}is currently active{autoDetect ? ' (auto-detected)' : ''}.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
