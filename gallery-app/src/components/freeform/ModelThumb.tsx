export default function ModelThumb({
  thumbnail,
  size = 48,
}: {
  thumbnail?: string;
  size?: number;
}) {
  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt=""
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          borderRadius: size > 40 ? 12 : 10,
        }}
      />
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ width: size * 0.5, height: size * 0.5 }}>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" />
    </svg>
  );
}
