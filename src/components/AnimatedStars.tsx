import { useEffect, useRef } from 'react';

const AnimatedStars = () => {
  const universeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!universeRef.current) return;

    const starCount = 400;
    const maxTime = 30;
    const universe = universeRef.current;
    
    const updateStars = () => {
      if (!universe) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      universe.innerHTML = '';
      
      for (let i = 0; i < starCount; ++i) {
        const ypos = Math.round(Math.random() * height);
        const star = document.createElement("div");
        const speed = 1000 * (Math.random() * maxTime + 1);
        const starClass = "star" + (3 - Math.floor(speed / 1000 / 8));
        star.setAttribute("class", starClass);
        star.style.backgroundColor = "white";
        star.style.position = "absolute";
        star.style.left = "0";
        star.style.top = "0";
        
        universe.appendChild(star);
        
        star.animate(
          [
            { transform: `translate3d(${width}px, ${ypos}px, 0)` },
            { transform: `translate3d(-${Math.random() * 256}px, ${ypos}px, 0)` }
          ],
          {
            delay: Math.random() * -speed,
            duration: speed,
            iterations: 1000
          }
        );
      }
    };
    
    updateStars();
    window.addEventListener('resize', updateStars);
    
    return () => window.removeEventListener('resize', updateStars);
  }, []);

  return <div ref={universeRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden', zIndex: 0 }} />;
};

export default AnimatedStars;
