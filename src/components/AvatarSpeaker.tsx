import { useEffect, useRef, useState } from 'react';
import {
  getTTSErrorMessage,
  isQuotaExceededTTSError,
  SequentialTTS,
  shouldRetryTTSError,
} from '@/services/textToSpeechService';

interface AvatarSpeakerProps {
  questionText: string;
  isUserResponding?: boolean;
  compact?: boolean;
  onSpeakingStart: () => void;
  onReadyToRespond: () => void;
  onPlaybackInterrupted: (reason: AvatarPlaybackIssueReason) => void;
}

export type AvatarPlaybackIssueReason = 'blocked' | 'text_only' | 'error';

type OrbState =
  | 'preparing'
  | 'retrying'
  | 'blocked'
  | 'error'
  | 'speaking'
  | 'listening'
  | 'textOnly';

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
  compact = false,
  onSpeakingStart,
  onReadyToRespond,
  onPlaybackInterrupted,
}: AvatarSpeakerProps) => {
  const [orbState, setOrbState] = useState<OrbState>('preparing');
  const [showListeningHint, setShowListeningHint] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [manualStartRequired, setManualStartRequired] = useState(false);
  const [lastErrorMessage, setLastErrorMessage] = useState('');

  const playbackTokenRef = useRef(0);
  const ttsRef = useRef<SequentialTTS | null>(null);
  const onSpeakingStartRef = useRef(onSpeakingStart);
  const onReadyToRespondRef = useRef(onReadyToRespond);
  const onPlaybackInterruptedRef = useRef(onPlaybackInterrupted);
  const listeningHintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onSpeakingStartRef.current = onSpeakingStart;
  }, [onSpeakingStart]);

  useEffect(() => {
    onReadyToRespondRef.current = onReadyToRespond;
  }, [onReadyToRespond]);

  useEffect(() => {
    onPlaybackInterruptedRef.current = onPlaybackInterrupted;
  }, [onPlaybackInterrupted]);

  const stopPlayback = () => {
    if (listeningHintTimerRef.current) {
      window.clearTimeout(listeningHintTimerRef.current);
      listeningHintTimerRef.current = null;
    }

    ttsRef.current?.stop();
    ttsRef.current = null;
  };

  const cancelPlayback = () => {
    playbackTokenRef.current += 1;
    stopPlayback();
  };

  const completeSpeaking = (token: number) => {
    if (playbackTokenRef.current !== token) return;
    setOrbState('listening');
    setShowListeningHint(false);
    setRetryAttempt(0);
    setManualStartRequired(false);
    setLastErrorMessage('');
    onReadyToRespondRef.current();
  };

  const enterTextOnlyMode = (token: number, message: string) => {
    if (playbackTokenRef.current !== token) return;
    stopPlayback();
    setOrbState('textOnly');
    setShowListeningHint(false);
    setRetryAttempt(0);
    setManualStartRequired(false);
    setLastErrorMessage(message);
    onPlaybackInterruptedRef.current('text_only');
  };

  const startPlayback = async () => {
    if (!questionText) return;

    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    setOrbState('preparing');
    setShowListeningHint(false);
    setRetryAttempt(0);
    setManualStartRequired(false);
    setLastErrorMessage('');
    stopPlayback();

    let attempt = 0;

    while (playbackTokenRef.current === token) {
      try {
        let speechStarted = false;
        const tts = new SequentialTTS(questionText);
        ttsRef.current = tts;

        await new Promise<void>((resolve, reject) => {
          tts.onSentencePlaybackStart = () => {
            if (playbackTokenRef.current !== token) return;
            setOrbState('speaking');
            setManualStartRequired(false);
            setLastErrorMessage('');

            if (!speechStarted) {
              speechStarted = true;
              onSpeakingStartRef.current();
            }
          };

          tts.onComplete = () => resolve();
          tts.onError = (error) => reject(error);

          void tts.start().catch((error) => {
            reject(error instanceof Error ? error : new Error('ElevenLabs playback failed to start'));
          });
        });

        if (playbackTokenRef.current !== token) {
          return;
        }

        completeSpeaking(token);
        return;
      } catch (error) {
        if (playbackTokenRef.current !== token) {
          return;
        }

        if (isAutoplayBlockedError(error)) {
          setOrbState('blocked');
          setManualStartRequired(true);
          setLastErrorMessage('Tarayici otomatik sesi engelledi. Sesi manuel olarak baslatin; yanit suresi ses tamamlandiginda baslayacak.');
          onPlaybackInterruptedRef.current('blocked');
          return;
        }

        if (isQuotaExceededTTSError(error)) {
          enterTextOnlyMode(token, getTTSErrorMessage(error));
          return;
        }

        const errorMessage = getTTSErrorMessage(error);
        setLastErrorMessage(errorMessage);
        console.error(`ElevenLabs playback attempt ${attempt + 1} failed:`, error);

        if (!shouldRetryTTSError(error) || attempt >= MAX_AUTO_RETRIES - 1) {
          setOrbState('error');
          onPlaybackInterruptedRef.current('error');
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

  useEffect(() => {
    if (!questionText) return;

    void startPlayback();

    return () => {
      cancelPlayback();
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

  const handleManualPlay = () => {
    void startPlayback();
  };

  const handleRetry = () => {
    void startPlayback();
  };

  const isPreparing = orbState === 'preparing' || orbState === 'retrying';
  const isSpeaking = orbState === 'speaking';
  const statusLabel = orbState === 'speaking'
            ? 'Searcho konusuyor'
            : orbState === 'blocked'
              ? 'Searcho sesi engellendi'
              : orbState === 'textOnly'
                ? 'Searcho metin modunda'
                : orbState === 'error'
          ? 'Searcho sesi baglanamadi'
          : orbState === 'listening'
            ? 'Searcho dinliyor'
            : 'Searcho sesi baglaniyor';
  const helperText = manualStartRequired
    ? lastErrorMessage
    : orbState === 'textOnly'
      ? (lastErrorMessage || 'Ses kotasi doldu. Yanit suresi baslamadi; ses tekrar denenmeli.')
      : orbState === 'error'
        ? (lastErrorMessage || 'ElevenLabs sesine ulasilamadi. Yanit suresi baslamadi; tekrar deneyin.')
        : orbState === 'retrying'
          ? `ElevenLabs sesi baglaniyor. Deneme ${retryAttempt}.`
          : showListeningHint
            ? 'Ses tamamlandi. Kayit otomatik olarak baslatiliyor.'
            : '';

  const shellClassName = compact
    ? 'w-full max-w-3xl rounded-[28px] px-5 py-5 shadow-[0_18px_44px_rgba(15,23,42,0.09)]'
    : 'w-full max-w-2xl rounded-[32px] px-6 py-8 shadow-[0_24px_60px_rgba(15,23,42,0.10)]';
  const orbWrapClassName = compact ? 'h-28 w-28' : 'h-40 w-40';
  const outerGlowClassName = compact ? 'h-24 w-24 blur-xl' : 'h-36 w-36 blur-2xl';
  const middleGlowClassName = compact ? 'h-20 w-20 blur-lg' : 'h-28 w-28 blur-xl';
  const coreOrbClassName = compact ? 'h-16 w-16' : 'h-24 w-24';
  const titleClassName = compact
    ? 'mx-auto max-w-2xl text-lg font-semibold leading-relaxed md:text-xl'
    : 'mx-auto max-w-xl text-xl font-semibold leading-relaxed md:text-2xl';
  const stackGapClassName = compact ? 'gap-4' : 'gap-6';

  return (
    <div className={`relative overflow-hidden border transition-all duration-500 ${shellClassName} ${
      isPreparing
        ? 'border-slate-200/90 bg-[linear-gradient(180deg,_#f6f6f6_0%,_#ededed_100%)]'
        : 'border-border/70 bg-[radial-gradient(circle_at_top,_hsl(var(--brand-primary)/0.20),_transparent_42%),linear-gradient(180deg,_#ffffff_0%,_hsl(var(--brand-primary-light)/0.35)_100%)]'
    }`}>
      <div className={`absolute inset-0 transition-opacity duration-500 ${
        isPreparing
          ? 'bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.25),transparent)] opacity-40'
          : 'bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.5),transparent)] opacity-70'
      }`} />

      <div className={`relative flex flex-col items-center text-center ${stackGapClassName}`}>
        <div className={`relative flex items-center justify-center ${orbWrapClassName}`}>
          <div className={`absolute rounded-full transition-all duration-500 ${outerGlowClassName} ${
            isPreparing
              ? 'bg-slate-300/35 opacity-70 scale-90'
              : isSpeaking
                ? 'bg-[hsl(var(--brand-primary)/0.26)] scale-110 opacity-100'
                : 'bg-[hsl(var(--brand-primary)/0.20)] scale-95 opacity-55'
          }`} />
          <div className={`absolute rounded-full transition-all duration-500 ${middleGlowClassName} ${
            isPreparing
              ? 'bg-slate-200/55 opacity-80 scale-90'
              : isSpeaking
                ? 'bg-[hsl(var(--brand-primary-light)/0.95)] scale-105 opacity-100'
                : 'bg-[hsl(var(--brand-primary-light)/0.75)] scale-90 opacity-65'
          }`} />
          <div className={`relative rounded-full transition-all duration-500 ${coreOrbClassName} ${
            isPreparing
              ? 'bg-[radial-gradient(circle_at_30%_30%,_#f4f4f5_0%,_#d4d4d8_45%,_#a1a1aa_100%)] shadow-[inset_0_6px_18px_rgba(255,255,255,0.35),0_10px_24px_rgba(115,115,115,0.16)] scale-95'
              : 'bg-[radial-gradient(circle_at_30%_30%,_hsl(var(--brand-primary-light))_0%,_hsl(var(--brand-primary)/0.48)_38%,_hsl(var(--brand-primary))_100%)] shadow-[inset_0_6px_18px_rgba(255,255,255,0.55),0_16px_40px_hsl(var(--brand-primary)/0.32)]'
          } ${isSpeaking ? 'animate-pulse scale-105' : 'scale-100'}`} />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-primary/70">
            {statusLabel}
          </p>
          <h3 className={`${titleClassName} ${
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
                onClick={handleManualPlay}
                className="rounded-full border border-brand-primary/30 bg-white px-4 py-2 text-sm font-medium text-brand-primary shadow-sm hover:border-brand-primary/50"
              >
                Soruyu Sesli Baslat
              </button>
            </div>
          ) : orbState === 'error' || orbState === 'textOnly' ? (
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
