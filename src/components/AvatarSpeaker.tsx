import { useEffect, useRef, useState } from 'react';
import { textToSpeech } from '@/services/textToSpeechService';

interface AvatarSpeakerProps {
  questionText: string;
  isUserResponding?: boolean;
  onSpeakingStart: () => void;
  onSpeakingComplete: () => void;
}

type OrbState = 'preparing' | 'speaking' | 'listening';

export const AvatarSpeaker = ({
  questionText,
  isUserResponding = false,
  onSpeakingStart,
  onSpeakingComplete,
}: AvatarSpeakerProps) => {
  const [orbState, setOrbState] = useState<OrbState>('preparing');
  const [showListeningHint, setShowListeningHint] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playbackTokenRef = useRef(0);
  const hasPlayedProviderAudioRef = useRef(false);
  const onSpeakingStartRef = useRef(onSpeakingStart);
  const onSpeakingCompleteRef = useRef(onSpeakingComplete);
  const listeningHintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onSpeakingStartRef.current = onSpeakingStart;
  }, [onSpeakingStart]);

  useEffect(() => {
    onSpeakingCompleteRef.current = onSpeakingComplete;
  }, [onSpeakingComplete]);

  const stopPlayback = () => {
    if (listeningHintTimerRef.current) {
      window.clearTimeout(listeningHintTimerRef.current);
      listeningHintTimerRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    if (utteranceRef.current && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
    }
  };

  const completeSpeaking = (token: number) => {
    if (playbackTokenRef.current !== token) return;
    setOrbState('listening');
    setShowListeningHint(false);
    onSpeakingCompleteRef.current();
  };

  const shouldUseBrowserFallback = (error?: unknown) => {
    if (hasPlayedProviderAudioRef.current) {
      return false;
    }

    const message = error instanceof Error ? error.message : String(error ?? '');
    const normalizedMessage = message.toLowerCase();

    return [
      'functionsfetcherror',
      'failed to send a request to the edge function',
      'edge function returned a non-2xx status code',
      'networkerror',
      'load failed',
      'failed to fetch',
      '404',
      '503',
      '504',
      'no audio content received',
    ].some((pattern) => normalizedMessage.includes(pattern));
  };

  const speakWithBrowserFallback = (text: string, token: number) => {
    if (!('speechSynthesis' in window)) {
      completeSpeaking(token);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.onstart = () => {
      if (playbackTokenRef.current !== token) return;
      setOrbState('speaking');
      onSpeakingStartRef.current();
    };
    utterance.onend = () => {
      utteranceRef.current = null;
      completeSpeaking(token);
    };
    utterance.onerror = () => {
      utteranceRef.current = null;
      completeSpeaking(token);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!questionText) return;

    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    setOrbState('preparing');
    setShowListeningHint(false);
    stopPlayback();

    let objectUrl: string | null = null;
    let cancelled = false;

    const speak = async () => {
      try {
        const audioBuffer = await textToSpeech(questionText);
        if (cancelled || playbackTokenRef.current !== token) return;

        const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        objectUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(objectUrl);
        audioRef.current = audio;

        audio.onplay = () => {
          if (playbackTokenRef.current !== token) return;
          hasPlayedProviderAudioRef.current = true;
          setOrbState('speaking');
          onSpeakingStartRef.current();
        };
        audio.onended = () => {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
          }
          audioRef.current = null;
          completeSpeaking(token);
        };
        audio.onerror = () => {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
          }
          audioRef.current = null;
          console.error('Provider audio playback failed; skipping browser fallback for this question');
          completeSpeaking(token);
        };

        await audio.play();
      } catch (error) {
        console.error('Turkish TTS playback failed:', error);
        if (!cancelled && playbackTokenRef.current === token && shouldUseBrowserFallback(error)) {
          console.warn('Using browser fallback as last resort for TTS startup failure');
          speakWithBrowserFallback(questionText, token);
        } else if (!cancelled && playbackTokenRef.current === token) {
          completeSpeaking(token);
        }
      }
    };

    void speak();

    return () => {
      cancelled = true;
      stopPlayback();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [questionText]);

  useEffect(() => {
    if (listeningHintTimerRef.current) {
      window.clearTimeout(listeningHintTimerRef.current);
      listeningHintTimerRef.current = null;
    }

    if (orbState !== 'listening' || isUserResponding) {
      setShowListeningHint(false);
      return;
    }

    listeningHintTimerRef.current = window.setTimeout(() => {
      setShowListeningHint(true);
      listeningHintTimerRef.current = null;
    }, 2000);

    return () => {
      if (listeningHintTimerRef.current) {
        window.clearTimeout(listeningHintTimerRef.current);
        listeningHintTimerRef.current = null;
      }
    };
  }, [orbState, isUserResponding]);

  const isSpeaking = orbState === 'speaking';
  const isPreparing = orbState === 'preparing';
  const statusLabel = orbState === 'speaking'
    ? 'Searcho konusuyor'
    : orbState === 'listening'
      ? 'Searcho dinliyor'
      : '';

  return (
    <div className={`relative w-full max-w-2xl overflow-hidden rounded-[32px] border px-6 py-8 shadow-[0_24px_60px_rgba(15,23,42,0.10)] transition-all duration-500 ${
      isPreparing
        ? 'border-slate-200/90 bg-[linear-gradient(180deg,_#f6f6f6_0%,_#ededed_100%)]'
        : 'border-border/70 bg-[radial-gradient(circle_at_top,_hsl(var(--brand-primary)/0.20),_transparent_42%),linear-gradient(180deg,_#ffffff_0%,_hsl(var(--brand-primary-light)/0.35)_100%)]'
    }`}>
      <div className={`absolute inset-0 transition-opacity duration-500 ${
        isPreparing
          ? 'bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.25),transparent)] opacity-40'
          : 'bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.5),transparent)] opacity-70'
      }`} />

      <div className="relative flex flex-col items-center gap-6 text-center">
        <div className="relative flex h-40 w-40 items-center justify-center">
          <div className={`absolute h-36 w-36 rounded-full blur-2xl transition-all duration-500 ${
            isPreparing
              ? 'bg-slate-300/35 opacity-70 scale-90'
              : isSpeaking
                ? 'bg-[hsl(var(--brand-primary)/0.26)] scale-110 opacity-100'
                : 'bg-[hsl(var(--brand-primary)/0.20)] scale-95 opacity-55'
          }`} />
          <div className={`absolute h-28 w-28 rounded-full blur-xl transition-all duration-500 ${
            isPreparing
              ? 'bg-slate-200/55 opacity-80 scale-90'
              : isSpeaking
                ? 'bg-[hsl(var(--brand-primary-light)/0.95)] scale-105 opacity-100'
                : 'bg-[hsl(var(--brand-primary-light)/0.75)] scale-90 opacity-65'
          }`} />
          <div className={`relative h-24 w-24 rounded-full transition-all duration-500 ${
            isPreparing
              ? 'bg-[radial-gradient(circle_at_30%_30%,_#f4f4f5_0%,_#d4d4d8_45%,_#a1a1aa_100%)] shadow-[inset_0_6px_18px_rgba(255,255,255,0.35),0_10px_24px_rgba(115,115,115,0.16)] scale-95'
              : 'bg-[radial-gradient(circle_at_30%_30%,_hsl(var(--brand-primary-light))_0%,_hsl(var(--brand-primary)/0.48)_38%,_hsl(var(--brand-primary))_100%)] shadow-[inset_0_6px_18px_rgba(255,255,255,0.55),0_16px_40px_hsl(var(--brand-primary)/0.32)]'
          } ${isSpeaking ? 'animate-pulse scale-105' : 'scale-100'}`} />
        </div>

        <div className="space-y-3">
          {statusLabel ? (
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-primary/70">
              {statusLabel}
            </p>
          ) : null}
          <h3 className={`mx-auto max-w-xl text-xl font-semibold leading-relaxed md:text-2xl ${
            isPreparing ? 'text-slate-500' : 'text-foreground'
          }`}>
            {questionText}
          </h3>
          <div className="min-h-6">
            <p
              className={`text-sm text-muted-foreground transition-all duration-700 ease-out ${
                showListeningHint ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
              }`}
            >
              Soruyu duyduysaniz yanit vermeye baslayabilirsiniz.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
