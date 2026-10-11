// VideoBackground.jsx — video en loop fijo detrás de toda la página.
// Se monta en <body> vía portal para que ningún ancestro con transform/filter
// (animaciones de entrada, cards glass) atrape el position:fixed.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getPrefs, subscribePrefs } from '../store/prefs';

// Horizontal para escritorio y vertical para celulares (con un solo video 16:9,
// object-fit:cover en una pantalla vertical lo agranda y recorta el centro).
// En tema claro se usa una versión con tinta azul sobre fondo blanco.
function sourceFor(orientation, theme) {
  const base = `/bg-planets-ascii${orientation === 'portrait' ? '-portrait' : ''}${theme === 'light' ? '-light' : ''}`;
  return { src: `${base}.mp4`, poster: `${base}-poster.jpg` };
}
const PORTRAIT_QUERY = '(max-aspect-ratio: 1/1)';

// veil='strong' oscurece más el video: para páginas con mucho texto (Deploy, Dashboard...)
export default function VideoBackground({ veil = 'soft' }) {
  const ref = useRef(null);

  useEffect(() => {
    const portrait = window.matchMedia(PORTRAIT_QUERY);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    const apply = () => {
      const v = ref.current;
      if (!v) return;
      const { src, poster } = sourceFor(portrait.matches ? 'portrait' : 'landscape', getPrefs().theme);
      if (!v.src.endsWith(src)) {
        v.poster = poster;
        v.src = src;
      }
      // Con "reducir movimiento" queda el primer fotograma, sin animación
      if (reduce.matches) v.pause();
      else v.play().catch(() => {});
    };

    apply();
    portrait.addEventListener('change', apply);
    reduce.addEventListener('change', apply);
    const unsubscribe = subscribePrefs(apply); // cambio de tema claro/oscuro
    return () => {
      portrait.removeEventListener('change', apply);
      reduce.removeEventListener('change', apply);
      unsubscribe();
    };
  }, []);

  return createPortal(
    <div aria-hidden className="video-bg">
      <video
        ref={ref}
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
