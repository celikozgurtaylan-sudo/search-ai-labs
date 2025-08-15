import { useState, useEffect } from 'react';

const words = [
  'içgörü',
  'fırsat', 
  'bulgu',
  'öncelik',
  'rapor',
  'senaryo',
  'fikir'
];

const colors = [
  'text-brand-primary',
  'text-brand-secondary', 
  'text-accent',
  'text-success',
  'text-warning',
  'text-info',
  'text-brand-primary'
];

export const AnimatedHeadline = () => {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      
      setTimeout(() => {
        setCurrentWordIndex((prev) => (prev + 1) % words.length);
        setTimeout(() => {
          setIsAnimating(false);
        }, 300); // 0.3s snap
      }, 900); // 0.9s pull
      
    }, 2400); // Total cycle: 0.9s pull + 0.3s snap + 1.2s reading pause

    return () => clearInterval(interval);
  }, []);

  return (
    <h1 className="text-5xl font-bold text-text-primary mb-6 leading-tight">
      Ürününüz hakkında sorunları keşfedin. Cevapları bulun.{' '}
      <span className="relative inline-block overflow-hidden w-[140px] text-left">
        <span 
          className={`
            inline-block transition-all ease-in-out whitespace-nowrap
            ${colors[currentWordIndex]}
            ${isAnimating 
              ? 'transform translate-y-full scale-y-75 opacity-10' 
              : 'transform translate-y-0 scale-y-100 opacity-100'
            }
            motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100
          `}
          style={{
            transitionProperty: 'transform, opacity',
            transitionDuration: isAnimating ? '0.9s' : '0.3s',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {words[currentWordIndex]}
        </span>
      </span>{' '}
      elinizde.
    </h1>
  );
};