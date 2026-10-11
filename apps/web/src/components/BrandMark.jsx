// Logo de StarDest: marca azul con estrella
export default function BrandMark({ size = 28 }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: size * 0.3, flexShrink: 0,
      background: 'var(--px-accent)', color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 6.9H21l-5.3 4 2 6.9L12 15.8 6.3 19.8l2-6.9L3 8.9h6.6z" /></svg>
    </span>
  );
}
