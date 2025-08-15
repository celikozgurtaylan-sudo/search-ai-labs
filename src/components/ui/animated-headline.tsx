import { useState, useEffect } from 'react';

const words = [
  'derin içgörü',
  'yeni fırsat', 
  'kritik bulgu',
  'öncelik listesi',
  'özet rapor',
  'test senaryosu',
  'uygulanabilir fikir'
];

export const AnimatedHeadline = () => {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      
      setTimeout(() => {
        setCurrentWordIndex((prev) => (prev + 1) % words.length);
        setIsAnimating(false);
      }, 900); // 0.9s pull duration
      
    }, 3000); // Total cycle: 0.9s pull + 0.3s snap + 1.8s reading pause

    return () => clearInterval(interval);
  }, []);

  return (
    <h1 className="text-5xl font-bold text-text-primary mb-6 leading-tight">
      Ürününüz hakkında sorunları keşfedin. Cevapları bulun.{' '}
      <span className="relative inline-block">
        <span 
          className={`
            inline-block transition-all duration-900 ease-out
            ${isAnimating 
              ? 'transform translate-y-8 scale-y-110 opacity-10' 
              : 'transform translate-y-0 scale-y-100 opacity-100'
            }
            motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100
          `}
          style={{
            transitionProperty: 'transform, opacity',
            transitionDuration: isAnimating ? '0.9s' : '0.3s',
          }}
        >
          {words[currentWordIndex]}
        </span>
      </span>{' '}
      elinizde.
    </h1>
  );
};