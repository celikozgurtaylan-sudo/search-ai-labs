import { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  isActive: boolean;
  isSpeaking: boolean;
  className?: string;
}

export const AudioWaveform = ({ isActive, isSpeaking, className = '' }: AudioWaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bars = 30;
    const barWidth = canvas.width / bars;
    let phase = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < bars; i++) {
        const x = i * barWidth;
        let height;
        
        if (isSpeaking) {
          // Active speaking animation
          height = Math.sin(phase + i * 0.5) * 20 + 25;
        } else if (isActive) {
          // Idle listening animation
          height = Math.sin(phase + i * 0.3) * 8 + 15;
        } else {
          // Inactive state
          height = 5;
        }

        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - height);
        gradient.addColorStop(0, 'hsl(var(--primary))');
        gradient.addColorStop(1, 'hsl(var(--primary) / 0.5)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x + barWidth * 0.2, canvas.height - height, barWidth * 0.6, height);
      }

      phase += 0.1;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, isSpeaking]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={60}
      className={className}
      style={{ width: '100%', height: '60px' }}
    />
  );
};
