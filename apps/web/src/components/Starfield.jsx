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
        this.x = (Math.random() - 0.5) * width * 2;
        this.y = (Math.random() - 0.5) * height * 2;
        this.z = Math.random() * width;
        this.pz = this.z;
        // Velocidad aleatoria para añadir dinamismo
        this.speed = Math.random() * 1.5 + 0.5;
      }
      
      update() {
        this.z = this.z - this.speed; 
        if (this.z < 1) {
          this.z = width;
          this.x = (Math.random() - 0.5) * width * 2;
          this.y = (Math.random() - 0.5) * height * 2;
          this.pz = this.z;
        }
      }
      
      draw() {
        let sx = (this.x / this.z) * width + width / 2;
        let sy = (this.y / this.z) * height + height / 2;
        
        let r = (1 - this.z / width) * 2;
        
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        // Colores ligeramente vibrantes (estrellas azules, celestes y blancas)
        const isBlue = Math.random() > 0.8;
        ctx.fillStyle = isBlue ? 'rgba(100, 200, 255, ' + (1 - this.z / width) + ')' : 'rgba(255, 255, 255, ' + (1 - this.z / width) + ')';
        ctx.fill();
        
        // Efecto warp (trazos)
        let px = (this.x / this.pz) * width + width / 2;
        let py = (this.y / this.pz) * height + height / 2;
        this.pz = this.z;
        
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx, sy);
        ctx.strokeStyle = isBlue ? 'rgba(100, 200, 255, ' + (1 - this.z / width) * 0.4 + ')' : 'rgba(255, 255, 255, ' + (1 - this.z / width) * 0.4 + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    for (let i = 0; i < numStars; i++) {
        stars.push(new Star());
    }

    let animationFrameId;
    const animate = () => {
      // El color de fondo "único": un azul/gris muy oscuro cósmico
      ctx.fillStyle = 'rgba(11, 15, 25, 0.3)'; 
      ctx.fillRect(0, 0, width, height);

      stars.forEach(star => {
        star.update();
        star.draw();
      });
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none z-0" />;
};

export default Starfield;
