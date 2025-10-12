import React, { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TypewriterText from "@/components/ui/typewriter-text";
import { Play, SkipForward } from "lucide-react";
interface TurkishPreambleDisplayProps {
  projectContext?: {
    description: string;
    participantId?: string;
  };
  onComplete: () => void;
  onSkip?: () => void;
}

// Turkish preamble text chunks - Split into shorter, more digestible pieces
const TURKISH_PREAMBLE_CHUNKS = [
  "Merhaba! Ben Searcho, yapay zeka destekli müşteri görüşme uzmanınızım.",
  "Bu UX araştırması seansında size eşlik edeceğim.",
  "Bu görüşme tamamen gönüllülük esasına dayanır ve istediğiniz zaman çıkabilirsiniz.",
  "Görüşmemiz esnasında Lütfen samimi ve doğal olun.",
  "Bu araştırma, ürün geliştirme sürecimize sizlerin değerli görüşleriyle yardımcı olacak.",
  "Birkaç dakika sonra yapılandırılmış sorularımıza geçeceğiz.",
  "Başlamadan önce sizi biraz tanıyabilir miyiz?",
];
const TurkishPreambleDisplay: React.FC<TurkishPreambleDisplayProps> = ({ projectContext, onComplete, onSkip }) => {
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [preambleCompleted, setPreambleCompleted] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Enable skip after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setCanSkip(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Auto-advance to next chunk after typewriter completes
  const handleTypewriterComplete = () => {
    if (currentChunk < TURKISH_PREAMBLE_CHUNKS.length - 1) {
      // Wait 3 seconds then move to next chunk
      timerRef.current = setTimeout(() => {
        setCurrentChunk((prev) => prev + 1);
      }, 3000);
    } else {
      // All chunks completed
      setPreambleCompleted(true);
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const startPreamble = () => {
    setIsPlaying(true);
  };
  const handleSkip = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsPlaying(false);
    if (onSkip) {
      onSkip();
    } else {
      onComplete();
    }
  };

  const handleContinue = () => {
    onComplete();
  };
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
      <Card className="w-full max-w-2xl p-8 text-center">
        <div className="mb-6">
          <div className="text-sm text-muted-foreground mb-4">
            {currentChunk + 1} / {TURKISH_PREAMBLE_CHUNKS.length}
          </div>
        </div>

        <div className="mb-8 min-h-[100px] flex items-center justify-center">
          {preambleCompleted ? (
            <div className="text-center">
              <div className="text-lg leading-relaxed mb-4">
                {TURKISH_PREAMBLE_CHUNKS[TURKISH_PREAMBLE_CHUNKS.length - 1]}
              </div>
              <div className="text-sm text-muted-foreground mt-4">
                Devam etmek için butona basın
              </div>
            </div>
          ) : isPlaying ? (
            <TypewriterText
              text={TURKISH_PREAMBLE_CHUNKS[currentChunk]}
              speed={50}
              className="text-lg leading-relaxed"
              showCursor={false}
              onComplete={handleTypewriterComplete}
            />
          ) : (
            <div className="text-muted-foreground">Başlamak için butona basın</div>
          )}
        </div>

        <div className="flex justify-center gap-4">
          {!isPlaying && !preambleCompleted && (
            <Button onClick={startPreamble} className="flex items-center gap-2">
              <Play className="w-4 h-4" />
              Başlat
            </Button>
          )}

          {preambleCompleted && (
            <Button onClick={handleContinue} className="flex items-center gap-2">
              <SkipForward className="w-4 h-4" />
              Devam Et
            </Button>
          )}

          {isPlaying && canSkip && !preambleCompleted && (
            <Button variant="outline" onClick={handleSkip} className="flex items-center gap-2">
              <SkipForward className="w-4 h-4" />
              Geç
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};
export default TurkishPreambleDisplay;
