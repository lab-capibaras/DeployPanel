// VideoBackground.jsx — video en loop fijo detrás de toda la página.
// Se monta en <body> vía portal para que ningún ancestro con transform/filter
// (animaciones de entrada, cards glass) atrape el position:fixed.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function VideoBackground({ src, poster }) {
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
      <div style={{ position: 'absolute', inset: 0, background: 'var(--px-video-veil)' }} />
    </div>,
    document.body
  );
}
