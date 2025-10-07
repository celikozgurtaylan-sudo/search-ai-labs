import { useRef, useState, useEffect } from 'react';
import { Camera, CameraOff, Maximize2, Minimize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FloatingVideoProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isEnabled: boolean;
  onToggle: () => void;
  participantName?: string;
}

export const FloatingVideo = ({ 
  videoRef, 
  isEnabled, 
  onToggle,
  participantName = 'Participant'
}: FloatingVideoProps) => {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX - position.x,
      startY: e.clientY - position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && dragRef.current) {
        setPosition({
          x: e.clientX - dragRef.current.startX,
          y: e.clientY - dragRef.current.startY,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (isHidden) {
    return (
      <Button
        onClick={() => setIsHidden(false)}
        className="fixed bottom-24 right-6 z-50"
        size="icon"
        variant="outline"
      >
        <Camera className="h-4 w-4" />
      </Button>
    );
  }

  const videoSize = isExpanded ? { width: 480, height: 360 } : { width: 240, height: 180 };

  return (
    <div
      className="fixed z-50 rounded-lg overflow-hidden shadow-2xl bg-background border-2 border-border transition-all duration-200"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${videoSize.width}px`,
        height: `${videoSize.height}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <div
        className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-black/50 to-transparent z-10"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center justify-between px-2 h-full">
          <span className="text-white text-xs font-medium">{participantName}</span>
        </div>
      </div>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover"
      />

      {!isEnabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/90">
          <CameraOff className="h-12 w-12 text-muted-foreground" />
        </div>
      )}

      <div
        className={`absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/50 to-transparent transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center justify-center gap-1">
          <Button
            onClick={onToggle}
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white hover:bg-white/20"
          >
            {isEnabled ? <Camera className="h-3 w-3" /> : <CameraOff className="h-3 w-3" />}
          </Button>
          <Button
            onClick={() => setIsExpanded(!isExpanded)}
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white hover:bg-white/20"
          >
            {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <Button
            onClick={() => setIsHidden(true)}
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white hover:bg-white/20"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};
