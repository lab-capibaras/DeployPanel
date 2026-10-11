// VideoBackground.jsx — video en loop fijo detrás de toda la página.
// Se monta en <body> vía portal para que ningún ancestro con transform/filter
// (animaciones de entrada, cards glass) atrape el position:fixed.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// veil='strong' oscurece más el video: para páginas con mucho texto (Deploy, Dashboard...)
export default function VideoBackground({ src = '/bg-planets-ascii.mp4', poster = '/bg-planets-ascii-poster.jpg', veil = 'soft' }) {
  const ref = useRef(null);

  // Con "reducir movimiento" activado queda el primer fotograma (poster), sin animación
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const v = ref.current;
      if (!v) return;
      if (mq.matches) v.pause();
      else v.play().catch(() => {});
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return createPortal(
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden', background: 'var(--px-bg)' }}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <div style={{ position: 'absolute', inset: 0, background: veil === 'strong' ? 'var(--px-video-veil-strong)' : 'var(--px-video-veil)' }} />
    </div>,
    document.body
  );
}
