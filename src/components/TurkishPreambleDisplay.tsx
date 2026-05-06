import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, SkipForward, Volume2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getTTSErrorMessage, SequentialTTS } from "@/services/textToSpeechService";

interface TurkishPreambleDisplayProps {
  projectContext?: {
    description: string;
    participantId?: string;
    sessionToken?: string;
  };
  onComplete: () => void;
  onSkip?: () => void;
}

type PreamblePhase = "idle" | "preparing" | "speaking" | "blocked" | "error";

const TURKISH_PREAMBLE_CHUNKS = [
  "Merhaba, ben Searcho. Başlamadan önce sizi biraz rahatlatmak için kısa bir giriş yapacağım.",
  "Burada doğru ya da yanlış cevap yok. Aklınıza ne geliyorsa doğal şekilde paylaşmanız yeterli.",
  "Önce üç kısa ısınma sorusuyla başlayacağız. Sonra asıl araştırma sorularına birlikte geçeceğiz.",
];

const TURKISH_PREAMBLE_SPEECH = TURKISH_PREAMBLE_CHUNKS.join(" ");

const isAutoplayBlockedError = (error: unknown) => {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("notallowederror") || message.includes("user gesture") || message.includes("interaction");
};

const TurkishPreambleDisplay: React.FC<TurkishPreambleDisplayProps> = ({ onComplete, onSkip }) => {
  const [currentChunk, setCurrentChunk] = useState(0);
  const [phase, setPhase] = useState<PreamblePhase>("idle");
  const [canSkip, setCanSkip] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const ttsRef = useRef<SequentialTTS | null>(null);
  const completeTimerRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const { toast } = useToast();

  const stopPreambleAudio = useCallback(() => {
    ttsRef.current?.stop();
    ttsRef.current = null;

    if (completeTimerRef.current) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
  }, []);

  const finishPreamble = useCallback(() => {
    if (completedRef.current) {
      return;
    }

    completedRef.current = true;
    stopPreambleAudio();
    onComplete();
  }, [onComplete, stopPreambleAudio]);

  const skipPreamble = useCallback(() => {
    if (completedRef.current) {
      return;
    }

    completedRef.current = true;
    stopPreambleAudio();
    if (onSkip) {
      onSkip();
      return;
    }
    onComplete();
  }, [onComplete, onSkip, stopPreambleAudio]);

  const startPreamble = useCallback(async () => {
    if (completedRef.current) {
      return;
    }

    stopPreambleAudio();
    setPhase("preparing");
    setCurrentChunk(0);
    setCanSkip(true);
    setErrorMessage("");

    const tts = new SequentialTTS(TURKISH_PREAMBLE_SPEECH);
    ttsRef.current = tts;

    try {
      await new Promise<void>((resolve, reject) => {
        tts.onSentencePlaybackStart = (sentence) => {
          setCurrentChunk(Math.min(sentence.index, TURKISH_PREAMBLE_CHUNKS.length - 1));
          setPhase("speaking");
        };
        tts.onComplete = () => resolve();
        tts.onError = (error) => reject(error);

        void tts.start().catch((error) => {
          reject(error instanceof Error ? error : new Error("Preamble TTS failed to start"));
        });
      });

      if (completedRef.current) {
        return;
      }

      setCurrentChunk(TURKISH_PREAMBLE_CHUNKS.length - 1);
      completeTimerRef.current = window.setTimeout(() => {
        finishPreamble();
      }, 500);
    } catch (error) {
      if (completedRef.current) {
        return;
      }

      const message = getTTSErrorMessage(error);
      setErrorMessage(message);
      setPhase(isAutoplayBlockedError(error) ? "blocked" : "error");
      toast({
        title: "Başlangıç sesi açılamadı",
        description: "Metin ekranda kaldı; isterseniz tekrar deneyebilir veya görüşmeye geçebilirsiniz.",
        variant: "destructive",
      });
    }
  }, [finishPreamble, stopPreambleAudio, toast]);

  useEffect(() => {
    return () => {
      stopPreambleAudio();
    };
  }, [stopPreambleAudio]);

  const isPreparing = phase === "preparing";
  const isSpeaking = phase === "speaking";
  const shouldShowStart = phase === "idle" || phase === "blocked" || phase === "error";
  const statusText = isSpeaking
    ? "Searcho konuşuyor"
    : isPreparing
      ? "Ses hazırlanıyor"
      : phase === "blocked"
        ? "Ses manuel başlatılmalı"
        : phase === "error"
          ? "Ses açılamadı"
          : "Başlamaya hazır";

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-6">
      <Card className="w-full max-w-2xl overflow-hidden border-border/70 bg-card p-8 text-center shadow">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary-light text-brand-primary">
          {isPreparing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Volume2 className="h-6 w-6" />}
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-primary/70">
          {statusText}
        </p>

        <div className="mt-6 flex min-h-[120px] items-center justify-center">
          <p className="max-w-xl text-lg font-medium leading-relaxed text-text-primary">
            {TURKISH_PREAMBLE_CHUNKS[currentChunk]}
          </p>
        </div>

        {phase === "error" || phase === "blocked" ? (
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">
            {errorMessage || "Ses şu anda başlatılamadı."}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {shouldShowStart ? (
            <Button onClick={() => void startPreamble()} className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              {phase === "idle" ? "Sesi Başlat" : "Tekrar Dene"}
            </Button>
          ) : null}

          {canSkip || phase === "idle" || phase === "error" || phase === "blocked" ? (
            <Button variant="outline" onClick={skipPreamble} className="flex items-center gap-2">
              <SkipForward className="h-4 w-4" />
              Geç
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
};

export default TurkishPreambleDisplay;
