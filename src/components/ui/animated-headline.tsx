import { useState, useEffect } from 'react';

const words = [
  'Derin İçgörü',
  'Yeni Fırsat', 
  'Kritik Bulgu',
  'Öncelik Listesi',
  'Özet Rapor',
  'Test Senaryosu',
  'Uygulanabilir Fikir'
];

const colors = [
  'text-brand-primary',
  'text-brand-secondary', 
  'text-accent',
  'text-success',
  'text-brand-primary',
  'text-brand-secondary',
  'text-accent'
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
        }, 100);
      }, 600);
      
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  return (
    <h1 className="text-5xl font-bold text-text-primary mb-6 leading-tight">
      Ürününüz hakkında sorunları keşfedin. Cevapları bulun.{' '}
      <span className="relative inline-block overflow-hidden w-[280px] text-left">
        <span 
          className={`
            inline-block transition-all ease-in-out whitespace-nowrap
            ${colors[currentWordIndex]}
            ${isAnimating 
              ? 'transform translate-y-full scale-y-75 opacity-0' 
              : 'transform translate-y-0 scale-y-100 opacity-100'
            }
            motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100
          `}
          style={{
            transitionProperty: 'transform, opacity',
            transitionDuration: isAnimating ? '0.6s' : '0.2s',
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