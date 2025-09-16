import { useState, useEffect } from 'react';
import { Button } from './button';
import { Zap, Pause, Play, SkipForward } from 'lucide-react';

interface TypewriterTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  className?: string;
  enableControls?: boolean;
  showCursor?: boolean;
  delay?: number;
}

const TypewriterText = ({ 
  text, 
  speed = 50, 
  onComplete, 
  className = "",
  enableControls = false,
  showCursor = true,
  delay = 0
}: TypewriterTextProps) => {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentSpeed, setCurrentSpeed] = useState(speed);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (delay > 0 && !hasStarted) {
      const delayTimeout = setTimeout(() => {
        setHasStarted(true);
      }, delay);
      return () => clearTimeout(delayTimeout);
    } else if (delay === 0) {
      setHasStarted(true);
    }
  }, [delay, hasStarted]);

  useEffect(() => {
    if (!hasStarted || !text) return;
    
    if (currentIndex < text.length && isPlaying) {
      const timeout = setTimeout(() => {
        setDisplayText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, currentSpeed);

      return () => clearTimeout(timeout);
    } else if (onComplete && currentIndex === text.length) {
      onComplete();
    }
  }, [currentIndex, text, currentSpeed, onComplete, isPlaying, hasStarted]);

  // Reset when text changes
  useEffect(() => {
    setDisplayText('');
    setCurrentIndex(0);
    setHasStarted(delay === 0);
  }, [text, delay]);

  const handleSkip = () => {
    if (!text) return;
    setDisplayText(text);
    setCurrentIndex(text.length);
    if (onComplete) onComplete();
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const changeSpeed = () => {
    const speeds = [20, 50, 100, 200];
    const currentSpeedIndex = speeds.indexOf(currentSpeed);
    const nextSpeed = speeds[(currentSpeedIndex + 1) % speeds.length];
    setCurrentSpeed(nextSpeed);
  };

  return (
    <div className="relative">
      <span className={className}>
        {displayText}
        {showCursor && text && currentIndex < text.length && (
          <span className="animate-pulse text-brand-primary">|</span>
        )}
      </span>
      
      {enableControls && text && currentIndex < text.length && (
        <div className="absolute -right-20 top-0 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="ghost"
            onClick={togglePlayPause}
            className="w-6 h-6 p-0"
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={changeSpeed}
            className="w-6 h-6 p-0"
          >
            <Zap className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSkip}
            className="w-6 h-6 p-0"
          >
            <SkipForward className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default TypewriterText;