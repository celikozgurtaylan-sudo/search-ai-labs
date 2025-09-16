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

// Turkish preamble text chunks
const TURKISH_PREAMBLE_CHUNKS = ["Merhaba! Ben SEARCHO, bu UX araştırma seansının yapay zeka müşteri görüşmecisiyim.", "Bu görüşme tamamen gönüllülük esasına dayanır ve istediğiniz zaman çıkabilirsiniz.", "Sizi rahat hissetmeniz için buradayım. Lütfen samimi ve doğal olun.", "Bu araştırma, ürün geliştirme sürecimize yardımcı olacak değerli bilgiler sağlayacak.", "Birkaç dakika sonra yapılandırılmış sorularımıza geçeceğiz.", "Başlamadan önce herhangi bir sorunuz var mı?"];
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
    if (currentChunk >= TURKISH_PREAMBLE_CHUNKS.length) {
      // All chunks completed, now wait for user response
      setIsPlaying(false);
      setPreambleCompleted(true);
      setIsWaitingForResponse(true);
      console.log('Preamble completed, waiting for user response...');
      return;
    }

    // Stop any currently playing audio to prevent overlap
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0; // Reset to beginning
      setCurrentAudio(null);
    }

    // Play audio if available
    if (audioQueue[currentChunk]) {
      try {
        const audio = new Audio(`data:audio/mp3;base64,${audioQueue[currentChunk]}`);
        setCurrentAudio(audio);
        audio.onended = () => {
          setCurrentAudio(null);
          setTimeout(() => {
            setCurrentChunk(prev => prev + 1);
          }, 2000); // 2-second pause between chunks
        };
        audio.onerror = () => {
          console.error('Audio playback error');
          setCurrentAudio(null);
          // Continue to next chunk even if audio fails
          setTimeout(() => {
            setCurrentChunk(prev => prev + 1);
          }, 2000); // 2-second pause for consistency
        };
        
        // Add loading event to prevent multiple plays
        audio.onloadstart = () => {
          console.log(`Loading audio for chunk ${currentChunk + 1}`);
        };
        
        audio.play().catch(console.error);
      } catch (error) {
        console.error('Audio creation error:', error);
        setCurrentAudio(null);
        // Continue to next chunk
        setTimeout(() => {
          setCurrentChunk(prev => prev + 1);
        }, 2000); // 2-second pause for consistency
      }
    } else {
      // No audio, just wait for text to complete + 2-second pause
      setTimeout(() => {
        setCurrentChunk(prev => prev + 1);
      }, 4000); // 3s for text + 2s pause = 5s total, reduced to 4s for better flow
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