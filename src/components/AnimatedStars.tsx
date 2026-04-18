import { useEffect, useRef } from 'react';

const AnimatedStars = () => {
  const universeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!universeRef.current) return;

    const starCount = 400;
    const maxTime = 30;
    const universe = universeRef.current;
    
    const createStars = () => {
      if (!universe) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Limpiar estrellas existentes
      universe.innerHTML = '';
      
      for (let i = 0; i < starCount; ++i) {
        const ypos = Math.round(Math.random() * height);
        const star = document.createElement("div");
        const speed = 1000 * (Math.random() * maxTime + 1);
        const starClass = "star" + (3 - Math.floor(speed / 1000 / 8));
        star.setAttribute("class", starClass);
        star.style.backgroundColor = "white";
        star.style.position = "absolute";
        
        universe.appendChild(star);
        
        // Animación de movimiento
        star.animate(
          [
            {
              transform: `translate3d(${width}px, ${ypos}px, 0)`
            },
            {
              transform: `translate3d(-${Math.random() * 256}px, ${ypos}px, 0)`
            }
          ],
          {
            delay: Math.random() * -speed,
            duration: speed,
            iterations: Infinity
          }
        );
      }
    };
    
    // Crear estrellas iniciales
    createStars();
    
    // Recrear estrellas cuando la ventana cambie de tamaño
    window.addEventListener('resize', createStars);
    
    // Limpiar evento
    return () => window.removeEventListener('resize', createStars);
  }, []);

  return <div id="universe" ref={universeRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden', zIndex: 0, background: 'linear-gradient(to right, #00223e, #ffa17f)' }} />;
};

export default AnimatedStars;
