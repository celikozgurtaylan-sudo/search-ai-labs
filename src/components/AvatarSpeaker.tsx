import { useEffect, useRef, useState } from 'react';
import { textToSpeech } from '@/services/textToSpeechService';

interface AvatarSpeakerProps {
  questionText: string;
  isUserResponding?: boolean;
  onSpeakingStart: () => void;
  onSpeakingComplete: () => void;
}

type OrbState = 'preparing' | 'retrying' | 'blocked' | 'error' | 'speaking' | 'listening';

const RETRY_DELAYS_MS = [250, 500, 1000, 1500];
const MAX_AUTO_RETRIES = 3;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isAutoplayBlockedError = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('notallowederror') || message.includes('user gesture') || message.includes('interaction');
};

export const AvatarSpeaker = ({
  questionText,
  isUserResponding = false,
  onSpeakingStart,
  onSpeakingComplete,
}: AvatarSpeakerProps) => {
  const [orbState, setOrbState] = useState<OrbState>('preparing');
  const [showListeningHint, setShowListeningHint] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [manualStartRequired, setManualStartRequired] = useState(false);
  const [lastErrorMessage, setLastErrorMessage] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const playbackTokenRef = useRef(0);
  const onSpeakingStartRef = useRef(onSpeakingStart);
  const onSpeakingCompleteRef = useRef(onSpeakingComplete);
  const listeningHintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onSpeakingStartRef.current = onSpeakingStart;
  }, [onSpeakingStart]);

  useEffect(() => {
    onSpeakingCompleteRef.current = onSpeakingComplete;
  }, [onSpeakingComplete]);

  const revokeObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

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

    revokeObjectUrl();
  };

  const completeSpeaking = (token: number) => {
    if (playbackTokenRef.current !== token) return;
    setOrbState('listening');
    setShowListeningHint(false);
    setRetryAttempt(0);
    setManualStartRequired(false);
    setLastErrorMessage('');
    onSpeakingCompleteRef.current();
  };

  useEffect(() => {
    if (!questionText) return;

    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    setOrbState('preparing');
    setShowListeningHint(false);
    setRetryAttempt(0);
    setManualStartRequired(false);
    setLastErrorMessage('');
    stopPlayback();

    let cancelled = false;

    const speak = async () => {
      let attempt = 0;

      while (!cancelled && playbackTokenRef.current === token) {
        try {
          setRetryAttempt(attempt);
          setOrbState(attempt === 0 ? 'preparing' : 'retrying');

          const audioBuffer = await textToSpeech(questionText);
          if (cancelled || playbackTokenRef.current !== token) return;

          const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
          objectUrlRef.current = URL.createObjectURL(audioBlob);

          const playbackResult = await new Promise<'played' | 'blocked'>((resolve, reject) => {
            const audio = new Audio(objectUrlRef.current!);
            let playbackStarted = false;
            audio.preload = 'auto';
            audioRef.current = audio;

            audio.onplay = () => {
              if (playbackTokenRef.current !== token) return;
              playbackStarted = true;
              setOrbState('speaking');
              setManualStartRequired(false);
              setLastErrorMessage('');
              onSpeakingStartRef.current();
            };

            audio.onended = () => {
              audioRef.current = null;
              revokeObjectUrl();
              completeSpeaking(token);
              resolve('played');
            };

            audio.onerror = () => {
              audioRef.current = null;
              revokeObjectUrl();
              reject(new Error(playbackStarted ? 'ElevenLabs playback was interrupted' : 'ElevenLabs playback failed to start'));
            };

            audio.play().catch((error) => {
              if (isAutoplayBlockedError(error)) {
                setOrbState('blocked');
                setManualStartRequired(true);
                setLastErrorMessage('Tarayici otomatik sesi engelledi. Soruyu manuel olarak baslatin.');
                resolve('blocked');
                return;
              }

              audioRef.current = null;
              revokeObjectUrl();
              reject(error);
            });
          });

          if (playbackResult === 'blocked') {
            return;
          }

          return;
        } catch (error) {
          if (cancelled || playbackTokenRef.current !== token) {
            return;
          }

          const errorMessage = error instanceof Error ? error.message : 'ElevenLabs sesi su anda baglanamiyor.';
          setLastErrorMessage(errorMessage);
          console.error(`ElevenLabs playback attempt ${attempt + 1} failed:`, error);

          if (attempt >= MAX_AUTO_RETRIES - 1) {
            setOrbState('error');
            return;
          }

          const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
          setOrbState('retrying');
          attempt += 1;
          setRetryAttempt(attempt);
          await wait(delay);
        }
      }
    };

    void speak();

    return () => {
      cancelled = true;
      stopPlayback();
    };
  }, [questionText, retryNonce]);

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

  const handleManualPlay = async () => {
    const audio = audioRef.current;
    if (!audio) {
      setRetryNonce((current) => current + 1);
      return;
    }

    setManualStartRequired(false);
    setLastErrorMessage('');

    try {
      await audio.play();
    } catch (error) {
      setManualStartRequired(true);
      setOrbState('blocked');
      setLastErrorMessage('Ses halen baslatilamadi. Lutfen tekrar deneyin.');
    }
  };

  const handleRetry = () => {
    setRetryNonce((current) => current + 1);
  };

  const isPreparing = orbState === 'preparing' || orbState === 'retrying';
  const isSpeaking = orbState === 'speaking';
  const statusLabel = orbState === 'speaking'
    ? 'Searcho konusuyor'
    : orbState === 'blocked'
      ? 'Searcho sesi bekliyor'
      : orbState === 'error'
        ? 'Searcho sesi baglanamadi'
      : orbState === 'listening'
        ? 'Searcho dinliyor'
        : 'Searcho sesi baglaniyor';
  const helperText = manualStartRequired
    ? lastErrorMessage
    : orbState === 'error'
      ? (lastErrorMessage || 'ElevenLabs sesine ulasilamadi. Tekrar deneyin.')
    : orbState === 'retrying'
      ? `ElevenLabs sesi baglaniyor. Deneme ${retryAttempt}.`
    : showListeningHint
      ? 'Hazir oldugunuzda yanit vermeye baslayin.'
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
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-primary/70">
            {statusLabel}
          </p>
          <h3 className={`mx-auto max-w-xl text-xl font-semibold leading-relaxed md:text-2xl ${
            isPreparing ? 'text-slate-500' : 'text-foreground'
          }`}>
            {questionText}
          </h3>
          <div className="min-h-6">
            {helperText ? (
              <p className="text-sm text-muted-foreground">{helperText}</p>
            ) : null}
          </div>
          {manualStartRequired ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => void handleManualPlay()}
                className="rounded-full border border-brand-primary/30 bg-white px-4 py-2 text-sm font-medium text-brand-primary shadow-sm hover:border-brand-primary/50"
              >
                Soruyu Sesli Baslat
              </button>
            </div>
          ) : orbState === 'error' ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-full border border-brand-primary/30 bg-white px-4 py-2 text-sm font-medium text-brand-primary shadow-sm hover:border-brand-primary/50"
              >
                Tekrar Dene
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
