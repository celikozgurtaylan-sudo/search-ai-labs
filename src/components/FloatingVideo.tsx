import { useEffect, useRef, useState } from 'react';

interface FloatingVideoProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  participantName?: string;
  isVisible?: boolean;
}

export const FloatingVideo = ({ 
  videoRef, 
  participantName = 'Participant',
  isVisible = true,
}: FloatingVideoProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasUserMoved, setHasUserMoved] = useState(false);
  const pointerOffsetRef = useRef({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const videoSize = isExpanded ? { width: 320, height: 240 } : { width: 180, height: 128 };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasUserMoved) return;

    setPosition({
      x: window.innerWidth - videoSize.width - 24,
      y: window.innerHeight - videoSize.height - 24,
    });
  }, [videoSize.width, videoSize.height, hasUserMoved]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging) return;

      const nextX = event.clientX - pointerOffsetRef.current.x;
      const nextY = event.clientY - pointerOffsetRef.current.y;
      const maxX = window.innerWidth - videoSize.width - 12;
      const maxY = window.innerHeight - videoSize.height - 12;

      setPosition({
        x: Math.min(Math.max(12, nextX), maxX),
        y: Math.min(Math.max(12, nextY), maxY),
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, videoSize.height, videoSize.width]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    pointerOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    setHasUserMoved(true);
    setIsDragging(true);
  };

  return (
    <div
      ref={cardRef}
      className={`fixed z-50 overflow-hidden rounded-3xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur transition-[width,height,transform,opacity,left,top] duration-500 ${
        isVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-8 opacity-0'
      }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${videoSize.width}px`,
        height: `${videoSize.height}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-2"
        onPointerDown={handlePointerDown}
      >
        <div className="rounded-full bg-black/45 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
          {participantName}
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="rounded-full bg-black/45 px-3 py-1 text-[11px] font-medium text-white backdrop-blur transition-colors hover:bg-black/60"
        >
          {isExpanded ? 'Kucult' : 'Buyut'}
        </button>
      </div>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="h-full w-full object-cover"
      />
    </div>
  );
};
