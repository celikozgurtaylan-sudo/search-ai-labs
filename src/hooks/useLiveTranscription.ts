import { useCallback, useMemo, useRef, useState } from 'react';

// Display-only live captions via the browser Web Speech API. This is a UX aid
// shown while the participant speaks; the authoritative saved transcript still
// comes from the Whisper pipeline (AudioTranscriber). Unsupported browsers
// (Firefox, some Safari) get a no-op with isSupported=false.

export interface LiveTranscriptSegment {
  text: string;
  /** Per-utterance confidence 0..1 from the recognizer (0 = unknown in Chrome). */
  confidence: number;
}

// The Web Speech API is not in TS's DOM lib, so treat the constructor as unknown.
type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const getRecognitionCtor = (): SpeechRecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
};

export function useLiveTranscription(lang = 'tr-TR') {
  const ctorRef = useRef<SpeechRecognitionCtor | null>(getRecognitionCtor());
  const isSupported = Boolean(ctorRef.current);

  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const activeRef = useRef(false);

  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [segments, setSegments] = useState<LiveTranscriptSegment[]>([]);

  const reset = useCallback(() => {
    setFinalText('');
    setInterimText('');
    setSegments([]);
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* stop() can throw if the session never started */
      }
    }
    setInterimText('');
  }, []);

  const start = useCallback(() => {
    const Ctor = ctorRef.current;
    if (!Ctor || activeRef.current) return;

    reset();
    activeRef.current = true;

    const launch = () => {
      if (!activeRef.current) return;

      const rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const alternative = result[0];
          const transcript = (alternative?.transcript ?? '').trim();
          if (result.isFinal) {
            if (transcript) {
              const confidence = typeof alternative?.confidence === 'number' ? alternative.confidence : 0;
              setSegments((prev) => [...prev, { text: transcript, confidence }]);
              setFinalText((prev) => (prev ? `${prev} ${transcript}` : transcript));
            }
          } else {
            interim += alternative?.transcript ?? '';
          }
        }
        setInterimText(interim.trim());
      };

      rec.onerror = (event: any) => {
        // no-speech / aborted are benign and recover via onend restart.
        // A denied mic ends the whole live session.
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          activeRef.current = false;
        }
      };

      rec.onend = () => {
        // Chrome ends the session after silence; relaunch while still active.
        if (activeRef.current) {
          try {
            launch();
          } catch {
            activeRef.current = false;
          }
        }
      };

      recognitionRef.current = rec;
      try {
        rec.start();
      } catch {
        /* start() throws if called while already started; ignore */
      }
    };

    launch();
  }, [lang, reset]);

  return useMemo(
    () => ({ isSupported, start, stop, reset, finalText, interimText, segments }),
    [isSupported, start, stop, reset, finalText, interimText, segments],
  );
}
