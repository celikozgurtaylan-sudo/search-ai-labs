import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import TypewriterText from '@/components/ui/typewriter-text';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Play, SkipForward, Volume2 } from 'lucide-react';
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
  "Merhaba! Ben SEARCHO, yapay zeka destekli müşteri görüşme uzmanınızım.",
  "Bu UX araştırma seansında size eşlik edeceğim.",
  "Bu görüşme tamamen gönüllülük esasına dayanır ve istediğiniz zaman çıkabilirsiniz.",
  "Sizi rahat hissetmeniz için buradayım. Lütfen samimi ve doğal olun.",
  "Bu araştırma, ürün geliştirme sürecimize yardımcı olacak değerli bilgiler sağlayacak.",
  "Birkaç dakika sonra yapılandırılmış sorularımıza geçeceğiz.",
  "Başlamadan önce herhangi bir sorunuz var mı?"
];
const TurkishPreambleDisplay: React.FC<TurkishPreambleDisplayProps> = ({
  projectContext,
  onComplete,
  onSkip
}) => {
  const {
    toast
  } = useToast();
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioQueue, setAudioQueue] = useState<string[]>([]);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [preambleCompleted, setPreambleCompleted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [activeTimers, setActiveTimers] = useState<Set<NodeJS.Timeout>>(new Set());

  // Generate all audio chunks on mount
  useEffect(() => {
    generateAllAudioChunks();
  }, []);

  // Enable skip after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setCanSkip(true), 3000);
    return () => clearTimeout(timer);
  }, []);
  const generateAllAudioChunks = async () => {
    setIsGeneratingAudio(true);
    const audioData: string[] = [];
    try {
      for (const chunk of TURKISH_PREAMBLE_CHUNKS) {
        const {
          data,
          error
        } = await supabase.functions.invoke('turkish-tts', {
          body: {
            text: chunk,
            voice: 'XB0fDUnXU5powFXDhCwa' // Charlotte - ElevenLabs multilingual voice
          }
        });
        if (error) throw error;
        if (!data?.audioContent) throw new Error('No audio content received');
        audioData.push(data.audioContent);
      }
      setAudioQueue(audioData);
      setIsGeneratingAudio(false);

      // Auto-start playing after generation
      setTimeout(() => startPreamble(), 500);
    } catch (error) {
      console.error('Failed to generate Turkish audio:', error);
      setIsGeneratingAudio(false);
      toast({
        title: "Ses Hatası",
        description: "Türkçe ses oluşturulamadı. Sadece metin gösterilecek.",
        variant: "destructive"
      });
      // Continue with text-only
      setTimeout(() => startPreamble(), 500);
    }
  };
  const startPreamble = () => {
    setIsPlaying(true);
  };

  const moveToNextChunk = useCallback(() => {
    if (isTransitioning) {
      console.log('⚠️ Already transitioning, ignoring moveToNextChunk call');
      return;
    }
    
    setIsTransitioning(true);
    
    // Clear any existing timers to prevent overlaps
    activeTimers.forEach(timer => clearTimeout(timer));
    setActiveTimers(new Set());
    
    setCurrentChunk(prev => {
      const nextChunk = prev + 1;
      console.log(`Moving to chunk ${nextChunk + 1}/${TURKISH_PREAMBLE_CHUNKS.length}`);
      
      if (nextChunk < TURKISH_PREAMBLE_CHUNKS.length) {
        // Add a longer delay between chunks for better pacing
        const timer = setTimeout(() => {
          console.log(`🚀 Starting chunk ${nextChunk + 1} after delay`);
          setIsTransitioning(false);
          // The playback will be triggered by the useEffect when currentChunk changes
        }, 1500); // Increased delay to 1.5 seconds
        
        setActiveTimers(new Set([timer]));
      } else {
        // All chunks completed
        setIsPlaying(false);
        setPreambleCompleted(true);
        setIsWaitingForResponse(true);
        setIsTransitioning(false);
        console.log('✅ Preamble completed, waiting for user response...');
      }
      
      return nextChunk;
    });
  }, [isTransitioning, activeTimers]);

  const playCurrentChunk = useCallback(() => {
    const chunkIndex = currentChunk;
    const audioId = `audio-${chunkIndex}-${Date.now()}`;
    
    console.log(`🎵 [${audioId}] Starting chunk ${chunkIndex + 1}/${TURKISH_PREAMBLE_CHUNKS.length}: "${TURKISH_PREAMBLE_CHUNKS[chunkIndex]}"`);
    
    if (chunkIndex >= TURKISH_PREAMBLE_CHUNKS.length) {
      return; // This case is now handled in moveToNextChunk
    }

    // Stop any currently playing audio to prevent overlap
    if (currentAudio) {
      console.log(`🛑 [${audioId}] Stopping previous audio to prevent overlap`);
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }

    // Play audio if available
    if (audioQueue[chunkIndex]) {
      try {
        console.log(`🎧 [${audioId}] Creating and playing audio for chunk ${chunkIndex + 1}`);
        const audio = new Audio(`data:audio/mp3;base64,${audioQueue[chunkIndex]}`);
        setCurrentAudio(audio);
        
        let hasEnded = false; // Prevent multiple calls
        
        const handleAudioEnd = () => {
          if (hasEnded) {
            console.log(`⚠️ [${audioId}] Audio end handler called multiple times, ignoring`);
            return;
          }
          hasEnded = true;
          console.log(`✅ [${audioId}] Audio completed for chunk ${chunkIndex + 1}, moving to next...`);
          setCurrentAudio(null);
          
          // Use a timer that we can track and cancel if needed
          const timer = setTimeout(() => {
            moveToNextChunk();
          }, 1000); // Reduced delay since we added delay in moveToNextChunk
          
          setActiveTimers(prev => new Set([...prev, timer]));
        };
        
        const handleAudioError = (e: any) => {
          if (hasEnded) return;
          hasEnded = true;
          console.error(`❌ [${audioId}] Audio playback error for chunk ${chunkIndex + 1}:`, e);
          setCurrentAudio(null);
          
          const timer = setTimeout(() => {
            moveToNextChunk();
          }, 1000);
          
          setActiveTimers(prev => new Set([...prev, timer]));
        };
        
        // Set up event handlers
        audio.onended = handleAudioEnd;
        audio.onerror = handleAudioError;
        
        audio.onloadstart = () => {
          console.log(`📥 [${audioId}] Loading audio for chunk ${chunkIndex + 1}...`);
        };

        audio.oncanplaythrough = () => {
          console.log(`🎵 [${audioId}] Audio ready to play for chunk ${chunkIndex + 1}`);
        };
        
        // Add timeout protection
        const timeoutId = setTimeout(() => {
          if (!hasEnded) {
            console.warn(`⏰ [${audioId}] Audio timeout for chunk ${chunkIndex + 1}, moving to next`);
            hasEnded = true;
            audio.pause();
            setCurrentAudio(null);
            moveToNextChunk();
          }
        }, 15000); // 15-second timeout
        
        audio.play().catch(error => {
          clearTimeout(timeoutId);
          console.error(`❌ [${audioId}] Failed to play audio for chunk ${chunkIndex + 1}:`, error);
          if (!hasEnded) {
            hasEnded = true;
            setCurrentAudio(null);
            setTimeout(() => {
              moveToNextChunk();
            }, 2000);
          }
        });
      } catch (error) {
        console.error(`❌ [${audioId}] Audio creation error for chunk ${chunkIndex + 1}:`, error);
        setCurrentAudio(null);
        setTimeout(() => {
          moveToNextChunk();
        }, 2000);
      }
    } else {
      // No audio available - wait for typewriter to complete, then add 2s pause
      console.log(`📝 [${audioId}] No audio for chunk ${chunkIndex + 1}, waiting for typewriter + 2s pause`);
      // Will be handled by typewriter onComplete callback
    }
  }, [currentChunk, audioQueue, currentAudio, moveToNextChunk]);

  // Handle chunk progression with proper timing
  useEffect(() => {
    if (isPlaying && !isTransitioning) {
      console.log(`🚀 Playing chunk ${currentChunk + 1}/${TURKISH_PREAMBLE_CHUNKS.length}`);
      playCurrentChunk();
    }
  }, [isPlaying, currentChunk, isTransitioning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up audio
      if (currentAudio) {
        currentAudio.pause();
        setCurrentAudio(null);
      }
      
      // Clean up all active timers
      activeTimers.forEach(timer => clearTimeout(timer));
      setActiveTimers(new Set());
    };
  }, [currentAudio, activeTimers]);
  const handleSkip = () => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
    setIsPlaying(false);
    if (onSkip) {
      onSkip();
    } else {
      onComplete();
    }
  };

  const handleContinue = () => {
    console.log('User chose to continue to structured questions');
    setIsWaitingForResponse(false);
    onComplete();
  };

  const handleManualStart = () => {
    if (!isPlaying && !isGeneratingAudio) {
      startPreamble();
    }
  };
  return <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
      <Card className="w-full max-w-2xl p-8 text-center">
        <div className="mb-6">
          
          
          <div className="text-sm text-muted-foreground mb-4">
            {currentChunk + 1} / {TURKISH_PREAMBLE_CHUNKS.length}
          </div>
        </div>

        <div className="mb-8 min-h-[100px] flex items-center justify-center">
          {isGeneratingAudio ? (
            <div className="text-muted-foreground">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              Ses hazırlanıyor...
            </div>
          ) : isWaitingForResponse ? (
            <div className="text-center">
              <TypewriterText 
                text={TURKISH_PREAMBLE_CHUNKS[TURKISH_PREAMBLE_CHUNKS.length - 1]} 
                speed={100} 
                className="text-lg leading-relaxed mb-4" 
                showCursor={false} 
              />
              <div className="text-sm text-muted-foreground mt-4">
                Devam etmek için butona basın veya "hayır" / "yok" deyin
              </div>
            </div>
          ) : isPlaying && currentChunk < TURKISH_PREAMBLE_CHUNKS.length ? (
            <TypewriterText 
              text={TURKISH_PREAMBLE_CHUNKS[currentChunk]} 
              speed={100} 
              className="text-lg leading-relaxed" 
              showCursor={false}
              onComplete={() => {
                // When typewriter completes and no audio is playing, wait then move to next
                if (!currentAudio) {
                  console.log(`📝 Typewriter completed for chunk ${currentChunk + 1}, waiting before next`);
                  const timer = setTimeout(() => {
                    moveToNextChunk();
                  }, 1500); // Consistent timing with audio completion
                  
                  setActiveTimers(prev => new Set([...prev, timer]));
                }
              }}
            />
          ) : !isPlaying && currentChunk === 0 ? (
            <div className="text-muted-foreground">
              Başlamak için butona basın
            </div>
          ) : (
            <div className="text-lg text-primary font-medium">
              Yapılandırılmış görüşmeye geçiliyor...
            </div>
          )}
        </div>

        <div className="flex justify-center gap-4">
          {!isPlaying && !isGeneratingAudio && currentChunk === 0 && (
            <Button onClick={handleManualStart} className="flex items-center gap-2">
              <Play className="w-4 h-4" />
              Başlat
            </Button>
          )}
          
          {isWaitingForResponse && (
            <Button onClick={handleContinue} className="flex items-center gap-2">
              <SkipForward className="w-4 h-4" />
              Devam Et
            </Button>
          )}
          
          {isPlaying && canSkip && !isWaitingForResponse && (
            <Button variant="outline" onClick={handleSkip} className="flex items-center gap-2">
              <SkipForward className="w-4 h-4" />
              Geç
            </Button>
          )}
        </div>
      </Card>
    </div>;
};
export default TurkishPreambleDisplay;