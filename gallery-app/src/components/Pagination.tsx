interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, total, pageSize, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '30px 0'
    }}>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
        Showing {start}–{end} of {total} products
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          style={{
            width: 36, height: 36, borderRadius: 8, border: '1px solid var(--bg-tertiary)',
            background: 'var(--bg-secondary)', cursor: page === 1 ? 'default' : 'pointer',
            opacity: page === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.85rem', color: 'var(--text-dark)', transition: 'background 0.15s'
          }}
          onMouseEnter={e => { if (page > 1) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} style={{ width: 36, textAlign: 'center', color: 'var(--text-light)', fontSize: '0.85rem' }}>...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              style={{
                width: 36, height: 36, borderRadius: 8, border: 'none',
                background: p === page ? 'var(--primary-color)' : 'transparent',
                color: p === page ? '#fff' : 'var(--text-dark)',
                cursor: 'pointer', fontWeight: p === page ? 700 : 400,
                fontSize: '0.85rem', transition: 'background 0.15s'
              }}
              onMouseEnter={e => { if (p !== page) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
              onMouseLeave={e => { if (p !== page) e.currentTarget.style.background = 'transparent'; }}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
          style={{
            width: 36, height: 36, borderRadius: 8, border: '1px solid var(--bg-tertiary)',
            background: 'var(--bg-secondary)', cursor: page === totalPages ? 'default' : 'pointer',
            opacity: page === totalPages ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.85rem', color: 'var(--text-dark)', transition: 'background 0.15s'
          }}
          onMouseEnter={e => { if (page < totalPages) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
