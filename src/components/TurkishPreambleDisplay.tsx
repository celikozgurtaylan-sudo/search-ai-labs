import React, { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TypewriterText from "@/components/ui/typewriter-text";
import { Play, SkipForward, Mic, Square, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
interface TurkishPreambleDisplayProps {
  projectContext?: {
    description: string;
    participantId?: string;
    sessionToken?: string;
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
  
  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSaved, setRecordingSaved] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [preambleResponse, setPreambleResponse] = useState("");
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const { toast } = useToast();

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
    
    // If not on last chunk, move to next chunk
    if (currentChunk < TURKISH_PREAMBLE_CHUNKS.length - 1) {
      setCurrentChunk((prev) => prev + 1);
    } else {
      // On last chunk, skip the entire preamble
      if (onSkip) {
        onSkip();
      } else {
        onComplete();
      }
    }
  };

  const handleContinue = () => {
    // Clean up recording resources
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    onComplete();
  };

  // Convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        await processRecording();
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
      // Auto-stop after 20 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          stopRecording();
        }
      }, 20000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Mikrofon Hatası",
        description: "Mikrofona erişim izni verilemedi.",
        variant: "destructive",
      });
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  // Process and save recording
  const processRecording = async () => {
    setIsTranscribing(true);
    
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const base64Audio = await blobToBase64(audioBlob);
      
      // Call speech-to-text edge function
      const { data, error } = await supabase.functions.invoke('speech-to-text', {
        body: { audio: base64Audio, language: 'tr' }
      });
      
      if (error) throw error;
      
      const transcribedText = data.text;
      setPreambleResponse(transcribedText);
      
      // Save to database
      if (projectContext?.sessionToken) {
        const { error: updateError } = await supabase
          .from('study_sessions')
          .update({
            metadata: {
              preamble_response: transcribedText,
              preamble_recorded_at: new Date().toISOString(),
              preamble_audio_duration_ms: recordingDuration * 1000
            }
          })
          .eq('session_token', projectContext.sessionToken);
        
        if (updateError) throw updateError;
      }
      
      setRecordingSaved(true);
      toast({
        title: "Başarılı",
        description: "Yanıtınız kaydedildi!",
      });
      
    } catch (error) {
      console.error('Error processing recording:', error);
      toast({
        title: "Hata",
        description: "Ses kaydı işlenirken bir hata oluştu.",
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  // Start recording when preamble completes
  useEffect(() => {
    if (preambleCompleted && !isRecording && !recordingSaved) {
      // Small delay before starting recording
      const timeout = setTimeout(() => {
        startRecording();
      }, 1000);
      
      return () => clearTimeout(timeout);
    }
  }, [preambleCompleted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);
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
            <div className="text-center w-full">
              <div className="text-lg leading-relaxed mb-4">
                {TURKISH_PREAMBLE_CHUNKS[TURKISH_PREAMBLE_CHUNKS.length - 1]}
              </div>
              
              {/* Recording indicator */}
              {isRecording && (
                <div className="flex flex-col items-center gap-3 mt-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
                    <span className="text-sm font-medium">Kayıt ediliyor...</span>
                  </div>
                  <div className="text-2xl font-mono">
                    {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:
                    {(recordingDuration % 60).toString().padStart(2, '0')} / 00:20
                  </div>
                </div>
              )}
              
              {/* Transcribing indicator */}
              {isTranscribing && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Çevriliyor...</span>
                </div>
              )}
              
              {/* Success message */}
              {recordingSaved && (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <Check className="w-5 h-5" />
                    <span className="font-medium">Yanıtınız kaydedildi!</span>
                  </div>
                  {preambleResponse && (
                    <div className="bg-muted p-4 rounded-lg text-sm text-left">
                      "{preambleResponse}"
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground">
                    Devam etmek için butona basın
                  </div>
                </div>
              )}
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

          {preambleCompleted && recordingSaved && (
            <Button onClick={handleContinue} className="flex items-center gap-2">
              <SkipForward className="w-4 h-4" />
              Devam Et
            </Button>
          )}
          
          {preambleCompleted && isRecording && (
            <Button variant="destructive" onClick={stopRecording} className="flex items-center gap-2">
              <Square className="w-4 h-4" />
              Kaydı Durdur
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
