import React, { useEffect, useRef } from 'react';

const Starfield = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const numStars = 600;
    const stars = [];

    class Star {
      constructor() {
        this.reset(true);
      }

      reset(init = false) {
        this.x    = (Math.random() - 0.5) * width * 2;
        this.y    = (Math.random() - 0.5) * height * 2;
        this.z    = init ? Math.random() * width : width;
        this.pz   = this.z;
        this.speed = Math.random() * 1.5 + 0.5;
        // Assign a fixed hue per star for the blue palette in light mode
        // 200–240 = sky blue → royal blue range
        this.hue = 200 + Math.random() * 40;
      }

      update() {
        this.z -= this.speed;
        if (this.z < 1) this.reset();
      }

      draw(isLight) {
        const sx = (this.x / this.z) * width  + width  / 2;
        const sy = (this.y / this.z) * height + height / 2;
        const r  = Math.max(0, (1 - this.z / width) * 2);
        if (r === 0) return;

        const alpha = 1 - this.z / width;

        if (isLight) {
          // Blue palette: hues 200–240, higher saturation, medium-dark
          const fill   = `hsla(${this.hue}, 80%, 45%, ${alpha})`;
          const stroke = `hsla(${this.hue}, 80%, 45%, ${alpha * 0.35})`;

          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();

          // Warp trail
          const px = (this.x / this.pz) * width  + width  / 2;
          const py = (this.y / this.pz) * height + height / 2;
          this.pz = this.z;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.2;
          ctx.stroke();

        } else {
          // Dark palette: original white/light-blue
          const isBlue = Math.random() > 0.8;
          const fill   = isBlue
            ? `rgba(100, 200, 255, ${alpha})`
            : `rgba(255, 255, 255, ${alpha})`;
          const stroke = isBlue
            ? `rgba(100, 200, 255, ${alpha * 0.4})`
            : `rgba(255, 255, 255, ${alpha * 0.4})`;

          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();

          const px = (this.x / this.pz) * width  + width  / 2;
          const py = (this.y / this.pz) * height + height / 2;
          this.pz = this.z;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    for (let i = 0; i < numStars; i++) stars.push(new Star());

    let animationFrameId;

    const animate = () => {
      const isLight = document.documentElement.classList.contains('light-mode');

      // Background trail — light or dark
      ctx.fillStyle = isLight
        ? 'rgba(238, 243, 252, 0.35)'   // soft blue-white fade
        : 'rgba(11,  15,  25,  0.30)';  // original deep navy fade
      ctx.fillRect(0, 0, width, height);

      stars.forEach(star => {
        star.update();
        star.draw(isLight);
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      width  = window.innerWidth;
      height = window.innerHeight;
      canvas.width  = width;
      canvas.height = height;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
};

export default Starfield;
