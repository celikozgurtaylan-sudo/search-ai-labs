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
  "Merhaba! Ben SEARCHO, yapay zeka müşteri görüşmecisiyim.",
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
            voice: 'nova'
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
    playCurrentChunk();
  };
  const playCurrentChunk = useCallback(() => {
    console.log(`🎵 Starting chunk ${currentChunk + 1}/${TURKISH_PREAMBLE_CHUNKS.length}: "${TURKISH_PREAMBLE_CHUNKS[currentChunk]}"`);
    
    if (currentChunk >= TURKISH_PREAMBLE_CHUNKS.length) {
      // All chunks completed, now wait for user response
      setIsPlaying(false);
      setPreambleCompleted(true);
      setIsWaitingForResponse(true);
      console.log('✅ Preamble completed, waiting for user response...');
      return;
    }

    // Stop any currently playing audio to prevent overlap
    if (currentAudio) {
      console.log('🛑 Stopping previous audio to prevent overlap');
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }

    // Play audio if available
    if (audioQueue[currentChunk]) {
      try {
        console.log(`🎧 Playing audio for chunk ${currentChunk + 1}`);
        const audio = new Audio(`data:audio/mp3;base64,${audioQueue[currentChunk]}`);
        setCurrentAudio(audio);
        
        let hasEnded = false; // Prevent multiple calls
        
        audio.onended = () => {
          if (hasEnded) return;
          hasEnded = true;
          console.log(`✅ Audio completed for chunk ${currentChunk + 1}, waiting 2s before next...`);
          setCurrentAudio(null);
          setTimeout(() => {
            setCurrentChunk(prev => prev + 1);
          }, 2000); // Standardized 2-second pause
        };
        
        audio.onerror = (e) => {
          if (hasEnded) return;
          hasEnded = true;
          console.error(`❌ Audio playback error for chunk ${currentChunk + 1}:`, e);
          setCurrentAudio(null);
          setTimeout(() => {
            setCurrentChunk(prev => prev + 1);
          }, 2000); // Standardized 2-second pause
        };
        
        audio.onloadstart = () => {
          console.log(`📥 Loading audio for chunk ${currentChunk + 1}...`);
        };

        audio.oncanplaythrough = () => {
          console.log(`🎵 Audio ready to play for chunk ${currentChunk + 1}`);
        };
        
        // Add timeout protection
        const timeoutId = setTimeout(() => {
          if (!hasEnded) {
            console.warn(`⏰ Audio timeout for chunk ${currentChunk + 1}, moving to next`);
            hasEnded = true;
            audio.pause();
            setCurrentAudio(null);
            setCurrentChunk(prev => prev + 1);
          }
        }, 15000); // 15-second timeout
        
        audio.onended = () => {
          clearTimeout(timeoutId);
          if (hasEnded) return;
          hasEnded = true;
          console.log(`✅ Audio completed for chunk ${currentChunk + 1}, waiting 2s before next...`);
          setCurrentAudio(null);
          setTimeout(() => {
            setCurrentChunk(prev => prev + 1);
          }, 2000);
        };
        
        audio.play().catch(error => {
          clearTimeout(timeoutId);
          console.error(`❌ Failed to play audio for chunk ${currentChunk + 1}:`, error);
          if (!hasEnded) {
            hasEnded = true;
            setCurrentAudio(null);
            setTimeout(() => {
              setCurrentChunk(prev => prev + 1);
            }, 2000);
          }
        });
      } catch (error) {
        console.error(`❌ Audio creation error for chunk ${currentChunk + 1}:`, error);
        setCurrentAudio(null);
        setTimeout(() => {
          setCurrentChunk(prev => prev + 1);
        }, 2000); // Standardized 2-second pause
      }
    } else {
      // No audio available - wait for typewriter + standardized pause
      console.log(`📝 No audio for chunk ${currentChunk + 1}, using text-only with 2s pause`);
      setTimeout(() => {
        setCurrentChunk(prev => prev + 1);
      }, 2000); // Standardized 2-second pause (text will complete naturally)
    }
  }, [currentChunk, audioQueue, currentAudio]);

  // Handle chunk progression
  useEffect(() => {
    if (isPlaying && currentChunk < TURKISH_PREAMBLE_CHUNKS.length) {
      console.log(`Starting chunk ${currentChunk + 1}/${TURKISH_PREAMBLE_CHUNKS.length}`);
      playCurrentChunk();
    }
  }, [currentChunk, isPlaying]);
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
                speed={50} 
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
              speed={50} 
              className="text-lg leading-relaxed" 
              showCursor={false} 
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