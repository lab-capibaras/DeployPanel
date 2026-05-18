import React from 'react';

/** Generic pixel grid renderer */
function PixelGrid({ rows, palette, scale = 1, pixelSize = 4 }) {
  const S = scale * pixelSize;
  return (
    <div style={{ display: 'inline-block', imageRendering: 'pixelated', lineHeight: 0, flexShrink: 0 }}>
      {rows.map((row, y) => (
        <div key={y} style={{ display: 'flex' }}>
          {row.map((c, x) => {
            const color = palette[c] || null;
            return (
              <div key={x} style={{
                width: S, height: S,
                background: color || 'transparent',
                boxShadow: color && palette.__glow?.[c] ? `0 0 ${S * 2}px ${palette.__glow[c]}` : 'none',
              }} />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────
   ROCKET  🚀 → blue/steel aerospace
──────────────────────────────────────────── */
export function PixelRocket({ scale = 1, style = {} }) {
  const S = scale * 4;
  const _ = null;
  const W = '#c8d8ff', B = '#2d5fff', D = '#1a3aaa', N = '#4a7fff';
  const S2 = '#0d1f6e', G = '#8ab0ff', X = '#1a2a88', E = '#00d4ff';
  const T0 = '#ffffff', T1 = '#d0e4ff', T2 = '#a0c0ff', T3 = '#6080cc', T4 = '#304080';
  const rows = [
    [_,_,_,N,_,_,_],
    [_,_,N,W,N,_,_],
    [_,_,B,W,B,_,_],
    [_,B,B,W,B,B,_],
    [_,B,B,G,B,B,_],
    [_,B,D,G,D,B,_],
    [X,B,B,B,B,B,X],
    [X,D,B,W,B,D,X],
    [_,D,B,B,B,D,_],
    [_,_,D,S2,D,_,_],
    [_,_,E,T0,E,_,_],
    [_,T1,T0,T0,T0,T1,_],
    [_,T2,T1,T0,T1,T2,_],
    [_,T3,T2,T1,T2,T3,_],
    [_,_,T3,T2,T3,_,_],
    [_,_,T4,T3,T4,_,_],
    [_,_,_,T4,_,_,_],
    [_,_,_,T4,_,_,_],
  ];
  return (
    <div style={{ display: 'inline-block', imageRendering: 'pixelated', lineHeight: 0, flexShrink: 0, ...style }}>
      {rows.map((row, y) => (
        <div key={y} style={{ display: 'flex' }}>
          {row.map((color, x) => (
            <div key={x} style={{
              width: S, height: S,
              background: color || 'transparent',
              boxShadow: color === T0 ? `0 0 ${S * 2}px #ffffff88`
                : color === E ? `0 0 ${S * 2}px ${E}99`
                : color === G ? `0 0 ${S}px ${G}66` : 'none',
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────
   SATELLITE DISH  📡 → pipeline / monitoring
──────────────────────────────────────────── */
export function PixelSatellite({ scale = 1 }) {
  const _ = 0, B = 1, M = 2, L = 3, W = 4, G = 5;
  const palette = {
    1: '#2d5fff', 2: '#1a3aaa', 3: '#8ab0ff', 4: '#c8d8ff', 5: '#4a7fff',
    __glow: { 4: '#c8d8ff88', 3: '#8ab0ff55' }
  };
  const rows = [
    [_,_,_,_,W,_,_,_],
    [_,_,_,_,B,_,_,_],
    [_,_,_,_,B,W,_,_],
    [_,L,B,B,B,_,_,_],
    [L,B,M,B,_,_,_,_],
    [B,M,B,_,_,_,_,_],
    [B,B,_,_,_,_,_,_],
    [M,_,_,_,_,_,_,_],
    [_,_,_,B,_,_,_,_],
    [_,_,B,B,B,_,_,_],
    [_,_,_,B,_,_,_,_],
  ];
  return <PixelGrid rows={rows} palette={palette} scale={scale} />;
}

/* ────────────────────────────────────────────
   UFO / FLYING SAUCER  🛸 → container/build
──────────────────────────────────────────── */
export function PixelUFO({ scale = 1 }) {
  const _ = 0, B = 1, D = 2, L = 3, W = 4, G = 5, E = 6;
  const palette = {
    1: '#2d5fff', 2: '#1a3aaa', 3: '#8ab0ff', 4: '#c8d8ff', 5: '#4a7fff', 6: '#00d4ff',
    __glow: { 6: '#00d4ffaa', 4: '#c8d8ff66' }
  };
  const rows = [
    [_,_,_,W,W,_,_,_],
    [_,_,W,L,L,W,_,_],
    [_,B,B,W,L,B,B,_],
    [B,B,D,B,B,D,B,B],
    [D,B,B,B,B,B,B,D],
    [_,E,B,B,B,B,E,_],
    [_,_,E,E,E,E,_,_],
  ];
  return <PixelGrid rows={rows} palette={palette} scale={scale} />;
}

/* ────────────────────────────────────────────
   GLOBE  🌐 → DNS / global network
──────────────────────────────────────────── */
export function PixelGlobe({ scale = 1 }) {
  const _ = 0, B = 1, D = 2, L = 3, W = 4, G = 5;
  const palette = {
    1: '#2d5fff', 2: '#1a3aaa', 3: '#8ab0ff', 4: '#c8d8ff', 5: '#4a7fff',
    __glow: { 3: '#8ab0ff44' }
  };
  const rows = [
    [_,_,B,B,B,_,_],
    [_,B,L,B,L,B,_],
    [B,B,B,B,B,B,B],
    [B,W,B,L,B,W,B],
    [B,B,B,B,B,B,B],
    [_,B,L,B,L,B,_],
    [_,_,B,B,B,_,_],
  ];
  return <PixelGrid rows={rows} palette={palette} scale={scale} />;
}

/* ────────────────────────────────────────────
   SHIELD  🛡️ → security
──────────────────────────────────────────── */
export function PixelShield({ scale = 1 }) {
  const _ = 0, B = 1, D = 2, L = 3, W = 4, V = 5;
  const palette = {
    1: '#9b59ff', 2: '#6a2fbf', 3: '#c8b0ff', 4: '#e8e0ff', 5: '#7b2fff',
    __glow: { 4: '#e8e0ff66' }
  };
  const rows = [
    [_,B,B,B,B,B,_],
    [B,V,W,W,W,V,B],
    [B,W,L,L,L,W,B],
    [B,W,L,W,L,W,B],
    [B,W,L,L,L,W,B],
    [_,B,W,W,W,B,_],
    [_,_,B,W,B,_,_],
    [_,_,_,B,_,_,_],
  ];
  return <PixelGrid rows={rows} palette={palette} scale={scale} />;
}

/* ────────────────────────────────────────────
   MONITOR / CHART  📊 → observability
──────────────────────────────────────────── */
export function PixelMonitor({ scale = 1 }) {
  const _ = 0, B = 1, D = 2, L = 3, W = 4, G = 5, C = 6;
  const palette = {
    1: '#2d5fff', 2: '#1a3aaa', 3: '#8ab0ff', 4: '#c8d8ff', 5: '#0d1f6e', 6: '#00d4ff',
    __glow: { 6: '#00d4ff88' }
  };
  const rows = [
    [B,B,B,B,B,B,B,B],
    [B,D,D,D,D,D,D,B],
    [B,D,_,_,C,_,D,B],
    [B,D,_,C,C,_,D,B],
    [B,D,L,C,C,C,D,B],
    [B,D,L,W,C,C,D,B],
    [B,B,B,B,B,B,B,B],
    [_,_,B,B,B,B,_,_],
    [_,_,_,B,B,_,_,_],
  ];
  return <PixelGrid rows={rows} palette={palette} scale={scale} />;
}

/* default export for navbar */
export default PixelRocket;
