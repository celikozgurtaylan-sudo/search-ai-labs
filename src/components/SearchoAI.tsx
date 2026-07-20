import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, ClipboardList, Loader2, Mic, PhoneOff, SkipForward, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useLiveTranscription } from '@/hooks/useLiveTranscription';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AudioTranscriber, AudioTranscriberMetrics, type AudioTranscriptSegment, type AudioTranscriptionResult } from '@/utils/AudioTranscriber';
import { interviewService, InterviewProgress, InterviewQuestion, setInterviewSessionToken } from '@/services/interviewService';
import { prefetchTextToSpeech, resetTextToSpeechSessionState } from '@/services/textToSpeechService';
import {
  MicFailureCode,
  getMicrophoneFailureMessage,
  mapMediaAccessErrorToFailureCode,
} from '@/utils/microphoneHealth';
import { AUDIO_PRIVACY_TRANSFORM, pitchShiftAudioForEvidence } from '@/utils/audioPrivacyTransform';
import TurkishPreambleDisplay from './TurkishPreambleDisplay';
import { AvatarSpeaker, type AvatarPlaybackIssueReason } from './AvatarSpeaker';
import MinimalVoiceWaves from './ui/minimal-voice-waves';

const RESPONSE_TIME_LIMIT_SECONDS = 120;
const RECOVERY_GRACE_SECONDS = 30;
const AUTO_SAVE_MIN_CHARACTERS = 8;
const AUTO_SAVE_MIN_WORDS = 2;
const TRANSCRIPTION_HEALTHCHECK_TTL_MS = 30_000;
const PROCESSING_PHASE_TIMEOUT_MS = 20_000;

type ResponseRecordingResult = {
  blob: Blob | null;
  durationMs: number;
};

type PendingResponseMedia = ResponseRecordingResult & {
  questionId: string;
};

type InterviewPhase =
  | 'idle'
  | 'asking'
  | 'awaiting_audio_playback'
  | 'ready_to_answer'
  | 'recording'
  | 'processing'
  | 'review'
  | 'recovering'
  | 'completed';

type CaptureStartOptions = {
  preserveDraft?: boolean;
  resetDuration?: boolean;
};

type ResponseDiagnosticStage =
  | 'draft_saved'
  | 'transcription_pipeline_unhealthy'
  | 'processing_timeout'
  | 'transcription_error'
  | 'capture_start_failed'
  | 'submit_failed'
  | 'media_attach_failed';

type SubmitResponseOptions = {
  audioDurationMs?: number;
  metadata?: Record<string, unknown>;
  skipReviewOnFailure?: boolean;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to convert media blob to base64'));
        return;
      }

      const [, base64Payload = ''] = result.split(',', 2);
      resolve(base64Payload);
    };

    reader.onerror = () => reject(reader.error ?? new Error('Failed to read media blob'));
    reader.readAsDataURL(blob);
  });

interface SearchoAIProps {
  isActive: boolean;
  cameraStream?: MediaStream | null;
  projectContext?: {
    description: string;
    discussionGuide?: unknown;
    researchMode?: 'structured' | 'ai_enhanced';
    aiEnhancedBrief?: unknown;
    template?: string;
    sessionId?: string;
    sessionToken?: string;
    projectId?: string;
    participantId?: string;
    designScreens?: Array<{
      name?: string;
      url: string;
      source?: string;
    }>;
  };
  onSessionEnd?: (reason?: 'manual' | 'completed') => void | Promise<void>;
  onPreambleStateChange?: (isActive: boolean) => void;
  onQuestionChange?: (question: InterviewQuestion | null, progress: InterviewProgress) => void;
  onMediaReleaseRequested?: () => void;
  onMediaRecoveryRequested?: (reason: MicFailureCode) => void;
  /**
   * When true, hold at the warmup→task boundary: the first usability task is
   * kept idle (behind the screen-recording gate) until recording starts, so the
   * warmup runs unrecorded but every task is captured.
   */
  awaitingScreenRecording?: boolean;
}

const isLiveTrack = (track?: MediaStreamTrack | null) => Boolean(track && track.readyState === 'live' && track.enabled !== false);

const getRecordingMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return undefined;

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
};

const shouldRequireTranscriptReview = (transcript: string) => {
  const normalizedTranscript = transcript.trim();
  const wordCount = normalizedTranscript.split(/\s+/).filter(Boolean).length;

  return normalizedTranscript.length < AUTO_SAVE_MIN_CHARACTERS || wordCount < AUTO_SAVE_MIN_WORDS;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const buildTranscriptSegments = (text: string, durationMs: number) => {
  const normalizedText = text.trim();
  if (!normalizedText) return [];

  const sentences = normalizedText.match(/[^.!?\n]+[.!?]?/g)?.map((segment) => segment.trim()).filter(Boolean) ?? [normalizedText];
  const totalCharacters = sentences.reduce((sum, sentence) => sum + Math.max(sentence.length, 1), 0);
  let cursorMs = 0;

  return sentences.map((sentence, index) => {
    const isLast = index === sentences.length - 1;
    const segmentDurationMs = isLast
      ? Math.max(0, durationMs - cursorMs)
      : Math.round(durationMs * (Math.max(sentence.length, 1) / Math.max(totalCharacters, 1)));
    const startMs = cursorMs;
    const endMs = isLast ? durationMs : Math.min(durationMs, startMs + segmentDurationMs);
    cursorMs = endMs;

    return {
      id: `segment-${index + 1}`,
      text: sentence,
      startMs,
      endMs,
    };
  });
};

const offsetTranscriptSegments = (segments: AudioTranscriptSegment[], offsetMs: number) =>
  segments.map((segment, index) => ({
    id: segment.id ?? `segment-${index + 1}`,
    text: segment.text,
    startMs: Math.max(0, Math.round(segment.startMs + offsetMs)),
    endMs: Math.max(0, Math.round(segment.endMs + offsetMs)),
  }));

const mergeTranscriptSegmentLists = (
  baseSegments: AudioTranscriptSegment[],
  nextSegments: AudioTranscriptSegment[],
  nextOffsetMs: number,
  fallbackText: string,
  totalDurationMs: number,
) => {
  const mergedSegments = [
    ...baseSegments,
    ...offsetTranscriptSegments(nextSegments, nextOffsetMs),
  ].filter((segment) => segment.text.trim());

  if (mergedSegments.length > 0) {
    return mergedSegments.map((segment, index) => ({
      ...segment,
      id: `segment-${index + 1}`,
    }));
  }

  return buildTranscriptSegments(fallbackText, totalDurationMs);
};

const scaleTranscriptSegments = (
  segments: AudioTranscriptSegment[],
  sourceDurationMs: number,
  targetDurationMs: number,
) => {
  if (segments.length === 0 || sourceDurationMs <= 0 || targetDurationMs <= 0) {
    return segments;
  }

  const scale = targetDurationMs / sourceDurationMs;
  return segments.map((segment) => ({
    ...segment,
    startMs: Math.max(0, Math.round(segment.startMs * scale)),
    endMs: Math.max(0, Math.round(segment.endMs * scale)),
  }));
};


const normalizeWarmupLabel = (value: unknown) =>
  String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');

const isWarmupLabel = (value: unknown) => {
  const normalized = normalizeWarmupLabel(value);
  return (
    normalized.includes('isinma') ||
    normalized.includes('warmup') ||
    normalized.includes('warm-up') ||
    normalized.includes('warm up')
  );
};

const isConversationalWarmupQuestion = (question?: InterviewQuestion | null) => {
  if (!question) return false;

  const metadata = isRecord(question.metadata) ? question.metadata : {};
  return (
    question.question_type === 'warmup_conversational' ||
    (metadata.sectionKind === 'warmup' && metadata.warmupDynamic === true) ||
    isWarmupLabel(question.section) ||
    isWarmupLabel(metadata.sectionTitle)
  );
};

const isUsabilityTaskQuestion = (question?: InterviewQuestion | null) => {
  if (!question) return false;
  const metadata = isRecord(question.metadata) ? question.metadata : {};
  return question.question_type === 'usability_task' || metadata.sectionKind === 'task';
};

const getQuestionSpeechText = (question?: InterviewQuestion | null) => {
  if (!question) return "";

  const questionText = question.question_text || "";
  if (!isConversationalWarmupQuestion(question)) {
    return questionText;
  }

  const metadata = isRecord(question.metadata) ? question.metadata : {};
  const warmupGeneration = isRecord(metadata.warmupGeneration) ? metadata.warmupGeneration : {};
  const spokenLeadIn = typeof warmupGeneration.spokenLeadIn === 'string'
    ? warmupGeneration.spokenLeadIn.trim()
    : "";

  return spokenLeadIn ? `${spokenLeadIn} ${questionText}` : questionText;
};

const SearchoAI = ({
  isActive,
  cameraStream = null,
  projectContext,
  onSessionEnd,
  onPreambleStateChange,
  onQuestionChange,
  onMediaReleaseRequested,
  onMediaRecoveryRequested,
  awaitingScreenRecording = false,
}: SearchoAIProps) => {
  const { toast } = useToast();

  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);
  // Holds the first usability task while the screen-recording gate is open, so
  // it is presented (and spoken) only once recording has started.
  const [heldTaskQuestion, setHeldTaskQuestion] = useState<InterviewQuestion | null>(null);
  const awaitingScreenRecordingRef = useRef(false);
  const [interviewProgress, setInterviewProgress] = useState<InterviewProgress>({
    completed: 0,
    total: 0,
    isComplete: false,
    percentage: 0,
  });
  const [questionsInitialized, setQuestionsInitialized] = useState(false);
  const [interviewPhase, setInterviewPhase] = useState<InterviewPhase>('idle');
  const [userTranscript, setUserTranscript] = useState('');
  const [editableTranscript, setEditableTranscript] = useState('');
  const [responseTimeRemaining, setResponseTimeRemaining] = useState(RESPONSE_TIME_LIMIT_SECONDS);
  const [responseTimerExpired, setResponseTimerExpired] = useState(false);
  const [responseTimerActive, setResponseTimerActive] = useState(false);
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [isPreamblePhase, setIsPreamblePhase] = useState(true);
  const [showTurkishPreamble, setShowTurkishPreamble] = useState(true);
  const [showEndSessionConfirmation, setShowEndSessionConfirmation] = useState(false);
  const [draftTranscript, setDraftTranscript] = useState('');
  const [draftTranscriptSegments, setDraftTranscriptSegments] = useState<AudioTranscriptSegment[]>([]);
  const [draftAudioDurationMs, setDraftAudioDurationMs] = useState(0);
  const [responseRecoveryMessage, setResponseRecoveryMessage] = useState<string | null>(null);
  const [resumeAfterFailure, setResumeAfterFailure] = useState(false);
  const [hasUsedRecoveryGrace, setHasUsedRecoveryGrace] = useState(false);
  const [isStartingCapture, setIsStartingCapture] = useState(false);
  const [currentAudioLevel, setCurrentAudioLevel] = useState(0);
  const [showSilentMicWarning, setShowSilentMicWarning] = useState(false);
  const [hasDetectedSpeechForCurrentAttempt, setHasDetectedSpeechForCurrentAttempt] = useState(false);

  const {
    isSupported: liveTranscriptSupported,
    start: startLiveTranscription,
    stop: stopLiveTranscription,
    finalText: liveFinalText,
    interimText: liveInterimText,
    segments: liveSegments,
  } = useLiveTranscription('tr-TR');

  // Live captions run only while actively recording. start() resets its own
  // state, so each answer begins with a clean live transcript.
  useEffect(() => {
    if (interviewPhase === 'recording') {
      startLiveTranscription();
    } else {
      stopLiveTranscription();
    }
  }, [interviewPhase, startLiveTranscription, stopLiveTranscription]);

  // Ensure the recognizer is torn down if the interview unmounts mid-recording.
  useEffect(() => stopLiveTranscription, [stopLiveTranscription]);

  const audioTranscriberRef = useRef<AudioTranscriber | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const microphoneRequestRef = useRef<Promise<MediaStream> | null>(null);
  const responseRecorderRef = useRef<MediaRecorder | null>(null);
  const responseChunksRef = useRef<Blob[]>([]);
  const responseRecordingTracksRef = useRef<MediaStreamTrack[]>([]);
  const responseRecordingStartedAtRef = useRef(0);
  const pendingResponseMediaRef = useRef<PendingResponseMedia | null>(null);
  const analysisTriggeredRef = useRef(false);
  const transcriptionHealthMonitorRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const lastTranscriptionHealthCheckAtRef = useRef(0);
  const transcriptionHealthCheckInFlightRef = useRef(false);
  const captureAttemptRef = useRef(0);
  const processingWatchdogRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => {
    setInterviewSessionToken(projectContext?.sessionToken ?? null);

    return () => {
      setInterviewSessionToken(null);
    };
  }, [projectContext?.sessionToken]);

  useEffect(() => {
    analysisTriggeredRef.current = false;
  }, [projectContext?.sessionId]);

  useEffect(() => {
    resetTextToSpeechSessionState();
  }, [projectContext?.sessionId]);

  useEffect(() => {
    onPreambleStateChange?.(showTurkishPreamble && isPreamblePhase);
  }, [isPreamblePhase, onPreambleStateChange, showTurkishPreamble]);

  const cleanupResponseRecording = useCallback(() => {
    responseRecordingTracksRef.current.forEach((track) => track.stop());
    responseRecordingTracksRef.current = [];
    responseChunksRef.current = [];
    responseRecorderRef.current = null;
    responseRecordingStartedAtRef.current = 0;
    setIsRecordingVideo(false);
    setCurrentAudioLevel(0);
  }, []);

  const releaseMicrophoneStream = useCallback(() => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;
  }, []);

  const clearTranscriptionHealthMonitor = useCallback(() => {
    if (transcriptionHealthMonitorRef.current) {
      window.clearInterval(transcriptionHealthMonitorRef.current);
      transcriptionHealthMonitorRef.current = null;
    }
  }, []);

  const clearProcessingWatchdog = useCallback(() => {
    if (processingWatchdogRef.current) {
      window.clearTimeout(processingWatchdogRef.current);
      processingWatchdogRef.current = null;
    }
  }, []);

  const invalidateCaptureAttempt = useCallback(() => {
    captureAttemptRef.current += 1;
    clearProcessingWatchdog();
    return captureAttemptRef.current;
  }, [clearProcessingWatchdog]);

  const ensureTranscriptionPipelineHealthy = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastTranscriptionHealthCheckAtRef.current < TRANSCRIPTION_HEALTHCHECK_TTL_MS) {
      return true;
    }

    if (transcriptionHealthCheckInFlightRef.current) {
      return true;
    }

    transcriptionHealthCheckInFlightRef.current = true;

    try {
      const { data, error } = await supabase.functions.invoke('speech-to-text', {
        body: { healthcheck: true },
      });

      if (error || !data?.ok) {
        return false;
      }

      lastTranscriptionHealthCheckAtRef.current = now;
      return true;
    } catch (error) {
      console.error('Transcription pipeline health check failed:', error);
      return false;
    } finally {
      transcriptionHealthCheckInFlightRef.current = false;
    }
  }, []);

  const stopResponseRecording = useCallback((discard = false): Promise<ResponseRecordingResult> => {
    const recorder = responseRecorderRef.current;
    const startedAt = responseRecordingStartedAtRef.current;

    if (!recorder || recorder.state === 'inactive') {
      cleanupResponseRecording();
      return Promise.resolve({ blob: null, durationMs: 0 });
    }

    return new Promise((resolve) => {
      let settled = false;

      const finalize = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        const durationMs = startedAt ? Math.max(0, performance.now() - startedAt) : 0;
        cleanupResponseRecording();
        resolve({ blob, durationMs });
      };

      recorder.onstop = () => {
        const blob = !discard && responseChunksRef.current.length > 0
          ? new Blob(responseChunksRef.current, { type: recorder.mimeType || 'video/webm' })
          : null;
        finalize(blob);
      };

      recorder.onerror = () => finalize(null);

      try {
        recorder.stop();
      } catch (error) {
        console.error('Failed to stop response recorder:', error);
        finalize(null);
      }
    });
  }, [cleanupResponseRecording]);

  const ensureMicrophoneStream = useCallback(async () => {
    const cameraAudioTrack = cameraStream?.getAudioTracks().find((track) => isLiveTrack(track));
    if (cameraAudioTrack) {
      const existingTrack = microphoneStreamRef.current?.getAudioTracks().find((track) => isLiveTrack(track));
      if (microphoneStreamRef.current && existingTrack) {
        microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const clonedTrack = cameraAudioTrack.clone();
      const streamFromCamera = new MediaStream([clonedTrack]);
      microphoneStreamRef.current = streamFromCamera;
      return streamFromCamera;
    }

    const existingTrack = microphoneStreamRef.current?.getAudioTracks().find((track) => isLiveTrack(track));
    if (microphoneStreamRef.current && existingTrack) {
      return microphoneStreamRef.current;
    }

    if (microphoneRequestRef.current) {
      return await microphoneRequestRef.current;
    }

    microphoneRequestRef.current = navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    }).then((stream) => {
      microphoneStreamRef.current = stream;
      return stream;
    }).finally(() => {
      microphoneRequestRef.current = null;
    });

    return await microphoneRequestRef.current;
  }, [cameraStream]);

  const startResponseRecording = useCallback(async (questionId: string, microphoneStream: MediaStream) => {
    const microphoneTrack = microphoneStream.getAudioTracks().find((track) => isLiveTrack(track));

    if (!microphoneTrack) {
      cleanupResponseRecording();
      return;
    }

    const tracks = [microphoneTrack.clone()];
    const recordingStream = new MediaStream(tracks);
    const mimeType = getRecordingMimeType();

    try {
      const recorder = mimeType
        ? new MediaRecorder(recordingStream, { mimeType })
        : new MediaRecorder(recordingStream);

      responseChunksRef.current = [];
      responseRecordingTracksRef.current = tracks;
      responseRecordingStartedAtRef.current = performance.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          responseChunksRef.current.push(event.data);
        }
      };
      recorder.start(600);
      responseRecorderRef.current = recorder;
      setIsRecordingVideo(true);
      console.log('Started async audio evidence recording for question:', questionId);
    } catch (error) {
      console.error('Failed to start response recording:', error);
      tracks.forEach((track) => track.stop());
      cleanupResponseRecording();
    }
  }, [cleanupResponseRecording]);

  const persistResponseDiagnostic = useCallback(async ({
    questionId,
    transcript,
    durationMs,
    stage,
    failureCode,
    error,
    extraMetadata,
  }: {
    questionId?: string | null;
    transcript?: string;
    durationMs?: number;
    stage: ResponseDiagnosticStage;
    failureCode?: string | null;
    error?: unknown;
    extraMetadata?: Record<string, unknown>;
  }) => {
    if (!projectContext?.sessionId || !questionId) {
      return;
    }

    const diagnosticMessage =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : undefined;

    try {
      await interviewService.saveResponse(projectContext.sessionId, {
        questionId,
        participantId: projectContext.participantId,
        transcription: transcript?.trim() || undefined,
        responseText: transcript?.trim() || undefined,
        audioDuration: typeof durationMs === 'number' ? Math.round(durationMs) : undefined,
        metadata: {
          responseDiagnostics: {
            stage,
            failureCode: failureCode ?? null,
            message: diagnosticMessage ?? null,
            attemptId: captureAttemptRef.current,
            recordedAt: new Date().toISOString(),
            ...extraMetadata,
          },
        },
      });
    } catch (diagnosticError) {
      console.error('Failed to persist response diagnostic:', diagnosticError);
    }
  }, [projectContext?.participantId, projectContext?.sessionId]);

  const discardPendingResponseMedia = useCallback(async () => {
    pendingResponseMediaRef.current = null;
    await stopResponseRecording(true);
  }, [stopResponseRecording]);

  const shutdownActiveResponseCapture = useCallback((discardPendingMedia = true) => {
    invalidateCaptureAttempt();
    clearTranscriptionHealthMonitor();

    if (audioTranscriberRef.current) {
      audioTranscriberRef.current.cancel();
      audioTranscriberRef.current = null;
    }

    pendingResponseMediaRef.current = null;

    if (discardPendingMedia) {
      void stopResponseRecording(true);
    }

    setResponseTimerActive(false);
    setResponseTimerExpired(false);
    setCurrentAudioLevel(0);
    setShowSilentMicWarning(false);
    setHasDetectedSpeechForCurrentAttempt(false);
  }, [clearTranscriptionHealthMonitor, invalidateCaptureAttempt, stopResponseRecording]);

  const uploadResponseMedia = useCallback(async (
    responseId: string,
    questionId: string,
    media: PendingResponseMedia,
    transcript: string,
    transcriptSegments: AudioTranscriptSegment[],
  ) => {
    if (!projectContext?.sessionId || !media.blob) {
      return;
    }

    try {
      const shiftedAudio = await pitchShiftAudioForEvidence(media.blob);
      const base64Audio = await blobToBase64(shiftedAudio.blob);
      const audioDuration = Math.round(shiftedAudio.durationMs || media.durationMs);
      const alignedTranscriptSegments = transcriptSegments.length > 0
        ? scaleTranscriptSegments(transcriptSegments, media.durationMs, audioDuration)
        : buildTranscriptSegments(transcript, audioDuration);
      await interviewService.attachResponseMedia(projectContext.sessionId, responseId, {
        audioDuration,
        metadata: {
          mediaUploadCompletedAt: new Date().toISOString(),
          captureAttemptId: captureAttemptRef.current,
          audioPrivacyTransform: shiftedAudio.transform,
        },
        audioBase64: base64Audio,
        audioMimeType: shiftedAudio.mimeType,
        audioPrivacyTransform: shiftedAudio.transform,
        transcriptSegments: alignedTranscriptSegments,
        questionId,
      });
    } catch (error) {
      console.error('Background response media upload failed:', error);
      await persistResponseDiagnostic({
        questionId,
        durationMs: media.durationMs,
        stage: 'media_attach_failed',
        failureCode: 'media_attach_failed',
        error,
        extraMetadata: {
          responseId,
          audioPrivacyTransform: AUDIO_PRIVACY_TRANSFORM,
        },
      });
    }
  }, [persistResponseDiagnostic, projectContext?.sessionId]);

  const mergeTranscriptSegments = useCallback((baseText: string, nextText: string) => {
    const normalizedBase = baseText.trim();
    const normalizedNext = nextText.trim();

    if (!normalizedBase) {
      return normalizedNext;
    }

    if (!normalizedNext) {
      return normalizedBase;
    }

    return `${normalizedBase}\n\n${normalizedNext}`;
  }, []);

  const persistDraftResponse = useCallback(async (transcript: string, durationMs: number) => {
    if (!projectContext?.sessionId || !currentQuestion?.id || !transcript.trim()) {
      return;
    }

    try {
      await interviewService.saveResponse(projectContext.sessionId, {
        questionId: currentQuestion.id,
        participantId: projectContext.participantId,
        transcription: transcript.trim(),
        responseText: transcript.trim(),
        audioDuration: Math.round(durationMs),
        isComplete: false,
        metadata: {
          draftSavedAt: new Date().toISOString(),
          questionText: currentQuestion.question_text,
          responseMode: 'draft',
          captureAttemptId: captureAttemptRef.current,
        },
      });
    } catch (error) {
      console.error('Failed to persist draft response:', error);
    }
  }, [currentQuestion?.id, currentQuestion?.question_text, projectContext?.participantId, projectContext?.sessionId]);

  const enterRecoveryState = useCallback((message: string, options?: { resume?: boolean; allowGraceIfNeeded?: boolean }) => {
    const shouldResume = options?.resume ?? false;
    const allowGraceIfNeeded = options?.allowGraceIfNeeded ?? false;

    if (allowGraceIfNeeded && responseTimeRemaining <= 0 && !hasUsedRecoveryGrace) {
      setResponseTimeRemaining(RECOVERY_GRACE_SECONDS);
      setHasUsedRecoveryGrace(true);
    }

    setInterviewPhase('recovering');
    setResponseTimerActive(false);
    setResponseTimerExpired(false);
    setResumeAfterFailure(shouldResume);
    setResponseRecoveryMessage(message);
    setIsStartingCapture(false);
    setCurrentAudioLevel(0);
    setShowSilentMicWarning(false);
    setHasDetectedSpeechForCurrentAttempt(false);
  }, [hasUsedRecoveryGrace, responseTimeRemaining]);

  const startProcessingWatchdog = useCallback((attemptId: number) => {
    clearProcessingWatchdog();
    processingWatchdogRef.current = window.setTimeout(() => {
      if (captureAttemptRef.current !== attemptId) {
        return;
      }

      shutdownActiveResponseCapture();
      setUserTranscript(draftTranscript);
      setEditableTranscript(draftTranscript);
      void persistResponseDiagnostic({
        questionId: currentQuestion?.id,
        transcript: draftTranscript,
        durationMs: draftAudioDurationMs,
        stage: 'processing_timeout',
        failureCode: 'processing_timeout',
        extraMetadata: {
          responseTimeRemaining,
        },
      });
      enterRecoveryState('Yanıtınız işlenirken zaman aşımı oluştu. Aynı soruda tekrar deneyebilir veya kaldığınız yerden devam edebilirsiniz.', {
        resume: true,
        allowGraceIfNeeded: true,
      });
      toast({
        title: 'İşleme zaman aşımına uğradı',
        description: 'Yanıt akışı kurtarma moduna alındı. Aynı soruda yeniden deneyebilirsiniz.',
        variant: 'destructive',
      });
    }, PROCESSING_PHASE_TIMEOUT_MS);
  }, [clearProcessingWatchdog, currentQuestion?.id, draftAudioDurationMs, draftTranscript, enterRecoveryState, persistResponseDiagnostic, responseTimeRemaining, shutdownActiveResponseCapture, toast]);

  const applyInterviewState = useCallback((nextQuestion: InterviewQuestion | null, progress: InterviewProgress) => {
    clearTranscriptionHealthMonitor();
    clearProcessingWatchdog();
    setCurrentQuestion(nextQuestion);
    setInterviewProgress(progress);
    onQuestionChange?.(nextQuestion, progress);
    setResponseTimerActive(false);
    setResponseTimerExpired(false);
    setResponseTimeRemaining(RESPONSE_TIME_LIMIT_SECONDS);
    setUserTranscript('');
    setEditableTranscript('');
    setDraftTranscript('');
    setDraftTranscriptSegments([]);
    setDraftAudioDurationMs(0);
    setResponseRecoveryMessage(null);
    setResumeAfterFailure(false);
    setHasUsedRecoveryGrace(false);
    setIsStartingCapture(false);
    setCurrentAudioLevel(0);
    setShowSilentMicWarning(false);
    setHasDetectedSpeechForCurrentAttempt(false);

    if (nextQuestion?.question_text) {
      // Hold the first post-warmup question until screen recording has started
      // (awaitingScreenRecording is only ever true for usability sessions). The
      // question is set (so onQuestionChange already fired and the recording
      // gate can appear) but we stay idle — no speech, no capture — until the
      // gate clears. Keyed on leaving warmup rather than the task marker so it
      // holds even before the task-tagging edge function is deployed.
      if (awaitingScreenRecordingRef.current && !isConversationalWarmupQuestion(nextQuestion)) {
        setHeldTaskQuestion(nextQuestion);
        setInterviewPhase('idle');
        return;
      }
      setInterviewPhase('asking');
      void prefetchTextToSpeech(getQuestionSpeechText(nextQuestion));
      return;
    }

    if (progress.isComplete && !analysisTriggeredRef.current) {
      analysisTriggeredRef.current = true;
      setInterviewPhase('completed');
      setCurrentQuestion(null);
      shutdownActiveResponseCapture();
      releaseMicrophoneStream();
      onMediaReleaseRequested?.();
      toast({
        title: 'Görüşme Tamamlandı!',
        description: 'Tüm sorular yanıtlandı.',
      });
      toast({
        title: 'Analiz Hazırlanıyor',
        description: 'Araştırma raporu arka planda güncellenecek.',
      });
      return;
    }

    setInterviewPhase('idle');
  }, [
    clearProcessingWatchdog,
    clearTranscriptionHealthMonitor,
    onMediaReleaseRequested,
    onQuestionChange,
    releaseMicrophoneStream,
    shutdownActiveResponseCapture,
    toast,
  ]);

  // Mirror the awaiting-recording prop into a ref so applyInterviewState can read
  // the current value without being recreated (and re-firing) on each change.
  useEffect(() => {
    awaitingScreenRecordingRef.current = awaitingScreenRecording;
  }, [awaitingScreenRecording]);

  // Once screen recording has started, present the task we were holding.
  useEffect(() => {
    if (!awaitingScreenRecording && heldTaskQuestion) {
      const question = heldTaskQuestion;
      setHeldTaskQuestion(null);
      setInterviewPhase('asking');
      void prefetchTextToSpeech(getQuestionSpeechText(question));
    }
  }, [awaitingScreenRecording, heldTaskQuestion]);

  const initializeInterviewQuestions = useCallback(async () => {
    const hasStructuredGuide = Boolean(projectContext?.discussionGuide);
    const hasAIEnhancedBrief = projectContext?.researchMode === 'ai_enhanced' && Boolean(projectContext?.aiEnhancedBrief);

    if (!projectContext?.sessionId || !projectContext?.projectId || (!hasStructuredGuide && !hasAIEnhancedBrief)) {
      console.error('Missing required data for interview initialization');
      return;
    }

    try {
      await interviewService.initializeQuestions(
        projectContext.projectId,
        projectContext.sessionId,
        projectContext.discussionGuide ?? projectContext.aiEnhancedBrief,
      );
      setQuestionsInitialized(true);
      toast({
        title: 'Görüşme Başlıyor',
        description: projectContext?.researchMode === 'ai_enhanced'
          ? 'AI enhanced görüşme akışı hazırlanıyor...'
          : 'Karşılama ve tanıtım ile başlıyoruz...',
      });
    } catch (error) {
      console.error('Failed to initialize questions:', error);
      toast({
        title: 'Hata',
        description: 'Görüşme soruları başlatılamadı',
        variant: 'destructive',
      });
    }
  }, [projectContext?.aiEnhancedBrief, projectContext?.discussionGuide, projectContext?.projectId, projectContext?.researchMode, projectContext?.sessionId, toast]);

  useEffect(() => {
    if (
      isActive &&
      projectContext?.sessionId &&
      projectContext?.projectId &&
      (projectContext?.discussionGuide || (projectContext?.researchMode === 'ai_enhanced' && projectContext?.aiEnhancedBrief)) &&
      !questionsInitialized
    ) {
      void initializeInterviewQuestions();
    }
  }, [initializeInterviewQuestions, isActive, projectContext?.aiEnhancedBrief, projectContext?.discussionGuide, projectContext?.projectId, projectContext?.researchMode, projectContext?.sessionId, questionsInitialized]);

  useEffect(() => {
    if (isActive && !sessionStartTime) {
      setSessionStartTime(new Date());
    }

    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isActive, sessionStartTime]);

  useEffect(() => {
    if (isActive) return;
    shutdownActiveResponseCapture();
  }, [isActive, shutdownActiveResponseCapture]);

  useEffect(() => {
    if (!currentQuestion?.id) return;
    setResponseTimeRemaining(RESPONSE_TIME_LIMIT_SECONDS);
    setResponseTimerExpired(false);
    setResponseTimerActive(false);
    setHasUsedRecoveryGrace(false);
    setCurrentAudioLevel(0);
    setShowSilentMicWarning(false);
    setHasDetectedSpeechForCurrentAttempt(false);
  }, [currentQuestion?.id]);

  useEffect(() => {
    if (!currentQuestion || !responseTimerActive || isSubmittingResponse) return;
    if (interviewPhase !== 'recording') return;
    if (responseTimeRemaining <= 0) return;

    const timer = window.setInterval(() => {
      setResponseTimeRemaining((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentQuestion, interviewPhase, isSubmittingResponse, responseTimeRemaining, responseTimerActive]);

  useEffect(() => {
    if (interviewPhase !== 'recording' || hasDetectedSpeechForCurrentAttempt || isSubmittingResponse) {
      setShowSilentMicWarning(false);
      return;
    }

    const warningTimer = window.setTimeout(() => {
      setShowSilentMicWarning(true);
    }, 5000);

    return () => window.clearTimeout(warningTimer);
  }, [hasDetectedSpeechForCurrentAttempt, interviewPhase, isSubmittingResponse]);

  const finishCurrentAnswer = useCallback(() => {
    if (!audioTranscriberRef.current || interviewPhase !== 'recording') {
      return;
    }

    const attemptId = captureAttemptRef.current;
    setInterviewPhase('processing');
    setResponseTimerActive(false);
    clearTranscriptionHealthMonitor();
    startProcessingWatchdog(attemptId);
    audioTranscriberRef.current.stop();
  }, [clearTranscriptionHealthMonitor, interviewPhase, startProcessingWatchdog]);

  useEffect(() => {
    if (!currentQuestion || responseTimeRemaining > 0 || responseTimerExpired || !responseTimerActive || interviewPhase !== 'recording') {
      return;
    }

    setResponseTimerExpired(true);
    setResponseTimerActive(false);
    toast({
      title: 'Süre doldu',
      description: 'Kaydı tamamlayıp yanıtı şimdi işleyeceğiz.',
    });
    finishCurrentAnswer();
  }, [currentQuestion, finishCurrentAnswer, interviewPhase, responseTimeRemaining, responseTimerActive, responseTimerExpired, toast]);

  const getNextQuestion = useCallback(async () => {
    if (!projectContext?.sessionId) return;

    setUserTranscript('');
    setEditableTranscript('');
    setResponseRecoveryMessage(null);
    setResumeAfterFailure(false);

    try {
      const data = await interviewService.getNextQuestion(projectContext.sessionId);
      applyInterviewState(data.nextQuestion, data.progress);
    } catch (error) {
      console.error('Failed to get next question:', error);
      toast({
        title: 'Hata',
        description: 'Sonraki soru alınamadı',
        variant: 'destructive',
      });
    }
  }, [applyInterviewState, projectContext?.sessionId, toast]);

  const startActualQuestions = useCallback(async () => {
    setIsPreamblePhase(false);
    setShowTurkishPreamble(false);
    await getNextQuestion();
    toast({
      title: 'Sorulara Geçiliyor',
      description: projectContext?.researchMode === 'ai_enhanced'
        ? 'Şimdi ısınma ile başlayan AI enhanced görüşmeye geçiyoruz.'
        : 'Şimdi yapılandırılmış görüşme sorularına başlıyoruz.',
    });
  }, [getNextQuestion, projectContext?.researchMode, toast]);

  const submitCurrentResponse = useCallback(async (transcription: string, options: SubmitResponseOptions = {}) => {
    if (!projectContext?.sessionId || !currentQuestion) {
      throw new Error('Session or question not available');
    }

    const normalizedTranscript = transcription.trim();
    const activeQuestion = currentQuestion;
    const pendingMedia = pendingResponseMediaRef.current?.questionId === activeQuestion.id
      ? pendingResponseMediaRef.current
      : null;
    let mediaToPersist: PendingResponseMedia | null = pendingMedia;

    setIsSubmittingResponse(true);
    setInterviewPhase('processing');
    setResponseRecoveryMessage(null);
    setResumeAfterFailure(false);
    setResponseTimerActive(false);

    try {
      if (!mediaToPersist) {
        const recording = await stopResponseRecording(false);
        mediaToPersist = { ...recording, questionId: activeQuestion.id };
      }

      pendingResponseMediaRef.current = null;

      const data = await interviewService.submitResponse(projectContext.sessionId, {
        questionId: activeQuestion.id,
        participantId: projectContext.participantId,
        transcription: normalizedTranscript,
        responseText: normalizedTranscript,
        audioDuration: Math.round(Math.max(mediaToPersist.durationMs, options.audioDurationMs ?? draftAudioDurationMs)),
        metadata: {
          timestamp: new Date().toISOString(),
          questionText: activeQuestion.question_text,
          questionType: activeQuestion.question_type,
          isFollowUp: activeQuestion.is_follow_up,
          questionMetadata: activeQuestion.metadata ?? {},
          autoSaved: true,
          usedDraftTranscript: draftTranscript.trim().length > 0,
          captureAttemptId: captureAttemptRef.current,
          ...(options.metadata ?? {}),
        },
      });

      setDraftTranscript('');
      setDraftTranscriptSegments([]);
      setDraftAudioDurationMs(0);
      applyInterviewState(data.nextQuestion, data.progress);

      const segmentsToPersist = normalizedTranscript === draftTranscript.trim()
        ? draftTranscriptSegments
        : buildTranscriptSegments(normalizedTranscript, Math.round(Math.max(mediaToPersist.durationMs, options.audioDurationMs ?? draftAudioDurationMs)));

      if (mediaToPersist.blob && data.response?.id) {
        void uploadResponseMedia(data.response.id, activeQuestion.id, mediaToPersist, normalizedTranscript, segmentsToPersist);
      }
    } catch (error) {
      console.error('Failed to submit response:', error);
      await persistResponseDiagnostic({
        questionId: activeQuestion.id,
        transcript: normalizedTranscript,
        durationMs: Math.max(mediaToPersist?.durationMs ?? 0, options.audioDurationMs ?? draftAudioDurationMs),
        stage: 'submit_failed',
        failureCode: 'submit_failed',
        error,
      });
      pendingResponseMediaRef.current = mediaToPersist;
      setEditableTranscript(normalizedTranscript);
      setUserTranscript(normalizedTranscript);
      if (options.skipReviewOnFailure) {
        enterRecoveryState('Isınma yanıtı otomatik kaydedilemedi. Aynı soruda yeniden deneyebilirsiniz.', {
          resume: false,
          allowGraceIfNeeded: false,
        });
        toast({
          title: 'Isınma yanıtı kaydedilemedi',
          description: 'Onay kutusu açılmadan aynı soruda yeniden kayıt alabilirsiniz.',
          variant: 'destructive',
        });
        return;
      }

      setInterviewPhase('review');
      toast({
        title: 'Hata',
        description: 'Yanıt kaydedilemedi. Aynı soruda kalındı; düzeltip tekrar deneyin.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingResponse(false);
    }
  }, [applyInterviewState, currentQuestion, draftAudioDurationMs, draftTranscript, draftTranscriptSegments, enterRecoveryState, persistResponseDiagnostic, projectContext?.participantId, projectContext?.sessionId, stopResponseRecording, toast, uploadResponseMedia]);

  const requestMediaRecovery = useCallback((reason: MicFailureCode, message?: string | null) => {
    onMediaRecoveryRequested?.(reason);
    return message ?? getMicrophoneFailureMessage(reason);
  }, [onMediaRecoveryRequested]);

  const beginAnswerCapture = useCallback(async (options?: CaptureStartOptions) => {
    const preserveDraft = options?.preserveDraft ?? true;
    const resetDuration = options?.resetDuration ?? false;
    const nextDraftTranscript = preserveDraft ? draftTranscript : '';
    const attemptId = invalidateCaptureAttempt();

    if (
      !currentQuestion?.id ||
      isSubmittingResponse ||
      interviewPhase === 'completed' ||
      interviewPhase === 'processing' ||
      isStartingCapture
    ) {
      return;
    }

    if (audioTranscriberRef.current) {
      audioTranscriberRef.current.cancel();
      audioTranscriberRef.current = null;
    }

    clearTranscriptionHealthMonitor();
    await discardPendingResponseMedia();

    if (captureAttemptRef.current !== attemptId) {
      return;
    }

    if (resetDuration || !preserveDraft) {
      setDraftTranscript('');
      setDraftTranscriptSegments([]);
      setDraftAudioDurationMs(0);
    }

    if (resetDuration) {
      setResponseTimeRemaining(RESPONSE_TIME_LIMIT_SECONDS);
      setHasUsedRecoveryGrace(false);
    }

    setIsStartingCapture(true);
    setResumeAfterFailure(false);
    setResponseRecoveryMessage(null);
    setUserTranscript(nextDraftTranscript);
    setEditableTranscript(nextDraftTranscript);
    setResponseTimerExpired(false);
    setResponseTimerActive(false);
    setCurrentAudioLevel(0);
    setShowSilentMicWarning(false);
    setHasDetectedSpeechForCurrentAttempt(false);

    try {
      const microphoneStream = await ensureMicrophoneStream();
      if (captureAttemptRef.current !== attemptId) {
        return;
      }

      const isTranscriptionHealthy = await ensureTranscriptionPipelineHealthy();
      if (captureAttemptRef.current !== attemptId) {
        return;
      }

      if (!isTranscriptionHealthy) {
        void persistResponseDiagnostic({
          questionId: currentQuestion.id,
          transcript: nextDraftTranscript,
          durationMs: draftAudioDurationMs,
          stage: 'transcription_pipeline_unhealthy',
          failureCode: 'transcription_service_unavailable',
        });
        enterRecoveryState('Transcript servisi şu anda hazır değil. Yanıtınızın boşa gitmemesi için kayıt başlatılmadı.', {
          resume: true,
          allowGraceIfNeeded: false,
        });
        toast({
          title: 'Transcript servisi kullanılamıyor',
          description: 'Birkaç saniye sonra tekrar deneyin.',
          variant: 'destructive',
        });
        return;
      }

      setInterviewPhase('recording');
      setResponseTimerActive(true);
      await startResponseRecording(currentQuestion.id, microphoneStream);
      if (captureAttemptRef.current !== attemptId) {
        void stopResponseRecording(true);
        return;
      }

      const transcriber = new AudioTranscriber();
      transcriber.onSpeechDetected = () => {
        if (captureAttemptRef.current !== attemptId) {
          return;
        }

        setHasDetectedSpeechForCurrentAttempt(true);
        setShowSilentMicWarning(false);
      };
      transcriber.onAudioLevel = (level: number) => {
        if (captureAttemptRef.current !== attemptId) {
          return;
        }

        setCurrentAudioLevel(level);
      };
      transcriber.onDebugMetrics = (metrics: AudioTranscriberMetrics) => {
        if (import.meta.env.DEV) {
          console.debug('Audio transcriber metrics:', metrics);
        }
      };
      transcriber.onComplete = async (result: AudioTranscriptionResult) => {
        if (captureAttemptRef.current !== attemptId) {
          return;
        }

        audioTranscriberRef.current = null;
        clearTranscriptionHealthMonitor();
        clearProcessingWatchdog();
        setResponseTimerActive(false);
        setResponseRecoveryMessage(null);
        setResumeAfterFailure(false);
        setCurrentAudioLevel(0);
        setShowSilentMicWarning(false);
        setHasDetectedSpeechForCurrentAttempt(false);

        const recording = await stopResponseRecording(false);
        if (captureAttemptRef.current !== attemptId || !currentQuestion?.id) {
          return;
        }

        const totalDurationMs = draftAudioDurationMs + recording.durationMs;
        const normalizedTranscript = mergeTranscriptSegments(draftTranscript, result.text.trim());
        const normalizedSegments = mergeTranscriptSegmentLists(
          draftTranscriptSegments,
          result.segments,
          draftAudioDurationMs,
          normalizedTranscript,
          totalDurationMs,
        );
        setDraftTranscript(normalizedTranscript);
        setDraftTranscriptSegments(normalizedSegments);
        setDraftAudioDurationMs(totalDurationMs);
        setUserTranscript(normalizedTranscript);

        pendingResponseMediaRef.current = { ...recording, questionId: currentQuestion.id };
        await persistDraftResponse(normalizedTranscript, totalDurationMs);

        if (captureAttemptRef.current !== attemptId) {
          return;
        }

        setEditableTranscript(normalizedTranscript);
        setInterviewPhase('review');
        toast({
          title: 'Yanıtı gözden geçirin',
          description: shouldRequireTranscriptReview(normalizedTranscript)
            ? 'Transkript kısa görünüyor. Düzenleyip kaydetmeniz önerilir.'
            : 'Kaydetmeden önce yanıtınızı düzenleyebilir veya olduğu gibi onaylayabilirsiniz.',
        });
      };
      transcriber.onError = async (error: string) => {
        if (captureAttemptRef.current !== attemptId) {
          return;
        }

        audioTranscriberRef.current = null;
        clearTranscriptionHealthMonitor();
        clearProcessingWatchdog();
        setResponseTimerActive(false);
        setCurrentAudioLevel(0);
        setShowSilentMicWarning(false);
        setHasDetectedSpeechForCurrentAttempt(false);

        const recording = await stopResponseRecording(false);
        if (currentQuestion?.id) {
          pendingResponseMediaRef.current = { ...recording, questionId: currentQuestion.id };
        }
        if (captureAttemptRef.current !== attemptId) {
          return;
        }

        void persistResponseDiagnostic({
          questionId: currentQuestion?.id,
          transcript: nextDraftTranscript,
          durationMs: draftAudioDurationMs,
          stage: 'transcription_error',
          failureCode: error,
          error,
        });

        if (error === 'MICROPHONE_SILENT') {
          const recoveryMessage = requestMediaRecovery('track_silent');
          setUserTranscript(nextDraftTranscript);
          setEditableTranscript(nextDraftTranscript);
          enterRecoveryState(recoveryMessage, {
            resume: true,
            allowGraceIfNeeded: false,
          });
          toast({
            title: 'Mikrofon sinyali algılanmadı',
            description: recoveryMessage,
            variant: 'destructive',
          });
          return;
        }

        const isSystemFailure = [
          'PREP_TIMEOUT',
          'NO_SPEECH_DETECTED',
          'TRANSCRIPTION_FAILED',
          'TRANSCRIPTION_TIMEOUT',
          'TRANSCRIPTION_EMPTY',
          'RECORDING_HEALTH_FAILURE',
          'TRANSCRIPTION_SERVICE_UNAVAILABLE',
          'MICROPHONE_DISCONNECTED',
        ].includes(error);

        if (error === 'MICROPHONE_DISCONNECTED') {
          const recoveryMessage = requestMediaRecovery('track_ended');
          setUserTranscript(nextDraftTranscript);
          setEditableTranscript(nextDraftTranscript);
          enterRecoveryState(recoveryMessage, {
            resume: true,
            allowGraceIfNeeded: false,
          });
          toast({
            title: 'Mikrofon bağlantısı kesildi',
            description: recoveryMessage,
            variant: 'destructive',
          });
          return;
        }

        if (isSystemFailure) {
          setUserTranscript(nextDraftTranscript);
          setEditableTranscript(nextDraftTranscript);
          setInterviewPhase('review');
          toast({
            title: 'Yanıtı gözden geçirin',
            description: nextDraftTranscript.trim()
              ? 'Transkript otomatik tamamlanamadı. Kaydedilen metni kontrol edip onaylayın.'
              : 'Transkript otomatik tamamlanamadı. Duyduğunuz yanıtı yazıp onaylayabilir veya yeniden kayıt alabilirsiniz.',
          });
          return;
        }

        toast({
          title: 'Hata',
          description: 'Ses kaydı başarısız oldu. Tekrar deneyin.',
          variant: 'destructive',
        });
        enterRecoveryState('Ses kaydı başarısız oldu. Aynı soruda yeniden deneyebilirsiniz.', {
          resume: true,
          allowGraceIfNeeded: false,
        });
      };

      audioTranscriberRef.current = transcriber;
      await transcriber.start(microphoneStream, {
        requireSpeechWithinMs: null,
        emitAudioLevels: true,
      });
    } catch (error) {
      if (captureAttemptRef.current !== attemptId) {
        return;
      }

      console.error('Failed to start listening:', error);
      clearTranscriptionHealthMonitor();
      const failureCode = mapMediaAccessErrorToFailureCode(error);
      void persistResponseDiagnostic({
        questionId: currentQuestion?.id,
        transcript: nextDraftTranscript,
        durationMs: draftAudioDurationMs,
        stage: 'capture_start_failed',
        failureCode,
        error,
      });
      const recoveryMessage = requestMediaRecovery(failureCode);
      enterRecoveryState(recoveryMessage, {
        resume: true,
        allowGraceIfNeeded: false,
      });
      toast({
        title: 'Mikrofon Hatası',
        description: recoveryMessage,
        variant: 'destructive',
      });
    } finally {
      setIsStartingCapture(false);
    }
  }, [
    clearProcessingWatchdog,
    clearTranscriptionHealthMonitor,
    currentQuestion,
    discardPendingResponseMedia,
    draftAudioDurationMs,
    draftTranscript,
    draftTranscriptSegments,
    ensureMicrophoneStream,
    ensureTranscriptionPipelineHealthy,
    enterRecoveryState,
    interviewPhase,
    invalidateCaptureAttempt,
    isStartingCapture,
    isSubmittingResponse,
    requestMediaRecovery,
    mergeTranscriptSegments,
    persistResponseDiagnostic,
    persistDraftResponse,
    startResponseRecording,
    stopResponseRecording,
    toast,
  ]);

  const reRecordAnswer = useCallback(async () => {
    setUserTranscript('');
    setEditableTranscript('');
    setResponseRecoveryMessage(null);
    setResumeAfterFailure(false);
    setDraftTranscript('');
    setDraftTranscriptSegments([]);
    setDraftAudioDurationMs(0);
    setResponseTimeRemaining(RESPONSE_TIME_LIMIT_SECONDS);
    setResponseTimerExpired(false);
    setResponseTimerActive(false);
    setHasUsedRecoveryGrace(false);
    setCurrentAudioLevel(0);
    setShowSilentMicWarning(false);
    setHasDetectedSpeechForCurrentAttempt(false);
    await beginAnswerCapture({ resetDuration: true, preserveDraft: false });
  }, [beginAnswerCapture]);

  const handleQuestionReadyToRespond = useCallback(() => {
    if (
      !currentQuestion?.id ||
      interviewPhase !== 'asking' ||
      isSubmittingResponse ||
      isStartingCapture ||
      audioTranscriberRef.current
    ) {
      return;
    }

    // Searcho has finished speaking. Do NOT auto-start recording (it could
    // capture Searcho's own audio tail). Surface a clear reply button instead;
    // recording begins only when the participant explicitly starts it.
    setInterviewPhase('ready_to_answer');
  }, [currentQuestion?.id, interviewPhase, isStartingCapture, isSubmittingResponse]);

  const handleQuestionPlaybackInterrupted = useCallback((reason: AvatarPlaybackIssueReason) => {
    setInterviewPhase('awaiting_audio_playback');
    setResponseTimerActive(false);
    setResponseTimerExpired(false);
    setCurrentAudioLevel(0);
    setShowSilentMicWarning(false);
    setHasDetectedSpeechForCurrentAttempt(false);

    if (reason === 'blocked') {
      toast({
        title: 'Soru sesi manuel olarak başlatılmalı',
        description: 'Yanıt süresi, soru seslendirmesi gerçekten tamamlandıktan sonra başlayacak.',
      });
      return;
    }

    if (reason === 'text_only') {
      toast({
        title: 'Soru sesi üretilemedi',
        description: 'Bu soruda ses gelmeden görüşme ilerlemeyecek. Lütfen sesi yeniden deneyin.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Sesli okuma başarısız oldu',
      description: 'Yanıt süresi başlamadı. Soru sesini tekrar denemeniz gerekiyor.',
      variant: 'destructive',
    });
  }, [toast]);

  const confirmAndSaveResponse = useCallback(async () => {
    if (!editableTranscript.trim()) {
      toast({
        title: 'Hata',
        description: 'Yanıt boş olamaz',
        variant: 'destructive',
      });
      return;
    }

    await submitCurrentResponse(editableTranscript);
  }, [editableTranscript, submitCurrentResponse, toast]);

  const skipQuestion = useCallback(async () => {
    if (!projectContext?.sessionId || !currentQuestion) {
      return;
    }

    try {
      shutdownActiveResponseCapture();
      const data = await interviewService.skipQuestion(projectContext.sessionId, currentQuestion.id, {
        questionText: currentQuestion.question_text,
      });

      toast({
        title: 'Soru Atlandı',
        description: 'Sonraki soruya geçiliyor...',
      });
      applyInterviewState(data.nextQuestion, data.progress);
    } catch (error) {
      console.error('Error skipping question:', error);
      toast({
        title: 'Hata',
        description: 'Soru atlanamadı. Lütfen tekrar deneyin.',
        variant: 'destructive',
      });
    }
  }, [applyInterviewState, currentQuestion, projectContext?.sessionId, shutdownActiveResponseCapture, toast]);

  useEffect(() => {
    return () => {
      clearProcessingWatchdog();
      clearTranscriptionHealthMonitor();
      if (audioTranscriberRef.current) {
        audioTranscriberRef.current.cancel();
        audioTranscriberRef.current = null;
      }

      void stopResponseRecording(true);
      pendingResponseMediaRef.current = null;
      releaseMicrophoneStream();
    };
  }, [clearProcessingWatchdog, clearTranscriptionHealthMonitor, releaseMicrophoneStream, stopResponseRecording]);

  const getSessionDuration = () => {
    if (!sessionStartTime) return '00:00';
    const duration = Math.floor((currentTime.getTime() - sessionStartTime.getTime()) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatTimerLabel = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const isRecordingPhase = interviewPhase === 'recording';
  const isAwaitingAudioPlaybackPhase = interviewPhase === 'awaiting_audio_playback';
  const isProcessingPhase = interviewPhase === 'processing';
  const isReviewPhase = interviewPhase === 'review';
  const isRecoveringPhase = interviewPhase === 'recovering';
  const isCompletedPhase = interviewPhase === 'completed' || interviewProgress.isComplete;
  const isAutoStartingPhase = interviewPhase === 'asking' && isStartingCapture;
  const isVoiceClearlyDetected = currentAudioLevel >= 8;
  // Live caption "understood?" signal from the last finalized utterance.
  // Chrome often reports confidence 0 (unknown) — treat that as fine, and only
  // flag genuinely low (0 < c < 0.6) confidence as "not clearly understood".
  const LIVE_CONFIDENCE_FLOOR = 0.6;
  const lastLiveConfidence = liveSegments.length ? liveSegments[liveSegments.length - 1].confidence : null;
  const liveUnderstood: boolean | null =
    lastLiveConfidence === null
      ? null
      : !(lastLiveConfidence > 0 && lastLiveConfidence < LIVE_CONFIDENCE_FLOOR);
  const liveStatusLabel =
    liveUnderstood === null
      ? 'Dinliyoruz…'
      : liveUnderstood
        ? 'Anlaşılıyor'
        : 'Duyuyoruz ama net değil — biraz daha yüksek sesle';
  const liveStatusTone =
    liveUnderstood === null ? 'text-slate-500' : liveUnderstood ? 'text-green-600' : 'text-amber-600';
  const isLowConfidenceSegment = (confidence: number) =>
    confidence > 0 && confidence < LIVE_CONFIDENCE_FLOOR;
  const isUserResponding = isRecordingPhase || isReviewPhase || isProcessingPhase || isSubmittingResponse || Boolean(userTranscript);
  const isReadyToAnswerPhase = interviewPhase === 'ready_to_answer';
  const shouldShowSpeaker = interviewPhase === 'asking' || isReadyToAnswerPhase || isAwaitingAudioPlaybackPhase;
  const shouldUseCompactTimerRail = isRecordingPhase || isProcessingPhase || isRecoveringPhase || isReviewPhase;

  const responseTimerLabel = isAwaitingAudioPlaybackPhase
    ? formatTimerLabel(RESPONSE_TIME_LIMIT_SECONDS)
    : formatTimerLabel(responseTimeRemaining);
  const responseTimerHeading = 'Yanıt süresi';
  const responseTimerDescription = isAwaitingAudioPlaybackPhase
    ? 'Yanıt süresi başlamadı. Önce soru sesi başarılı şekilde oynatılmalı ve tamamlanmalı.'
    : interviewPhase === 'asking'
    ? (isAutoStartingPhase
      ? 'Soru bitti. Mikrofon hazırlanıyor, birazdan konuşabilirsiniz.'
      : 'Searcho soruyu okuyor. Bittiğinde “Cevaplamaya Başla” düğmesi görünecek.')
    : isReadyToAnswerPhase
      ? 'Hazır olduğunuzda “Cevaplamaya Başla”ya basın. 2 dakikalık süre siz başlattığınızda başlar.'
    : isRecordingPhase
      ? 'Yanıt süresi başladı. Ses dalgası sizi duyduğumuzu gösterir.'
      : isProcessingPhase
        ? 'Kayıt tamamlandı. Şimdi yanıtınız işleniyor.'
        : isReviewPhase
          ? 'Yanıtınızı düzenleyip kaydedebilir veya yeniden kayıt alabilirsiniz.'
          : isRecoveringPhase
            ? 'Aynı soruda tekrar deneyebilir veya kaldığınız yerden devam edebilirsiniz.'
            : 'Yanıt süresi soru okuması biter bitmez otomatik başlar.';
  const responseTimerTone = responseTimeRemaining <= 10
    ? 'text-red-600'
    : responseTimeRemaining <= 30
      ? 'text-amber-600'
      : 'text-foreground';
  const compactTimerSummary = isRecordingPhase
    ? 'Kayıt canlı, konuşmaya devam edin.'
    : isProcessingPhase
      ? 'Kaydınız yazıya çevriliyor.'
      : isReviewPhase
        ? 'Yanıtınızı düzenleyip kaydedin.'
        : isRecoveringPhase
          ? 'Aynı soruda tekrar deneyin.'
          : responseTimerDescription;

  const renderResponsePanel = () => {
    if (isSubmittingResponse) {
      return (
        <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span className="text-sm font-bold uppercase tracking-wide text-blue-700">
              Yanıt kaydediliyor
            </span>
          </div>
          <div className="rounded-xl bg-white/80 p-3 text-sm text-slate-700">
            {userTranscript || 'Yanıtınız güvenli şekilde kaydediliyor...'}
          </div>
        </div>
      );
    }

    if (interviewPhase === 'asking') {
      return (
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {isAutoStartingPhase
              ? 'Mikrofon hazırlanıyor; birazdan konuşabilirsiniz.'
              : 'Searcho soruyu okuyor. Lütfen dinleyin; bittiğinde cevaplamak için düğme görünecek.'}
          </div>
        </div>
      );
    }

    if (isReadyToAnswerPhase) {
      return (
        <div className="rounded-2xl border-2 border-brand-primary/40 bg-brand-primary/5 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-3">
            <Mic className="h-4 w-4 text-brand-primary" />
            <span className="text-sm font-bold uppercase tracking-wide text-brand-primary">
              Sizin sıranız
            </span>
          </div>
          <p className="mb-3 text-sm leading-relaxed text-slate-700">
            Hazır olduğunuzda mikrofonu açmak için düğmeye basın. 2 dakikalık yanıt süresi siz başlattığınızda başlar.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button
              onClick={() => void beginAnswerCapture({ resetDuration: true, preserveDraft: true })}
              size="default"
              disabled={isStartingCapture}
              className="bg-brand-primary text-white hover:bg-brand-primary-hover"
            >
              {isStartingCapture ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
              Cevaplamaya Başla
            </Button>
            <Button onClick={() => void skipQuestion()} variant="outline" size="default" disabled={isStartingCapture}>
              <SkipForward className="mr-2 h-4 w-4" />
              Atla
            </Button>
          </div>
        </div>
      );
    }

    if (isAwaitingAudioPlaybackPhase) {
      return (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-3">
            <Mic className="h-4 w-4 text-amber-700" />
            <span className="text-sm font-bold uppercase tracking-wide text-amber-800">
              Soru sesi bekleniyor
            </span>
          </div>
          <div className="rounded-xl bg-white/80 p-3 text-sm leading-relaxed text-slate-700">
            Soru sesi tamamlanmadan kayıt ve 2 dakikalık süre başlamaz. Yukarıdaki ses kontrolünü kullanarak soruyu tekrar oynatın.
          </div>
        </div>
      );
    }

    if (isRecordingPhase) {
      return (
        <div className="rounded-2xl border-2 border-red-300 bg-gradient-to-r from-red-50 to-pink-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-3">
            <div className="relative">
              <div className="h-3.5 w-3.5 rounded-full bg-red-500 animate-pulse" />
              <div className="absolute inset-0 h-3.5 w-3.5 rounded-full bg-red-500 animate-ping" />
            </div>
            <span className="text-sm font-bold uppercase tracking-wide text-red-700">
              Kayıt alınıyor
            </span>
          </div>
          <div className="rounded-xl bg-white/80 p-3 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1.5">
                <p className="text-sm font-medium leading-relaxed text-slate-800">
                  Yanıtınız kaydediliyor. Bitirdiğinizde “Yanıtı Bitir” düğmesini kullanın.
                </p>
                <p className={`text-sm font-medium ${isVoiceClearlyDetected ? 'text-blue-700' : 'text-slate-500'}`}>
                  {isVoiceClearlyDetected ? 'Konuşuyorsunuz, sesiniz kayda giriyor.' : 'Dinliyoruz. Konuştuğunuzda ses dalgası yükselecek.'}
                </p>
                {showSilentMicWarning ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                    İlk 5 saniyede belirgin ses girişi görünmedi. Mikrofon seçimini kontrol edin; kayıt devam ediyor.
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-950/95 px-3 py-2 shadow-inner">
                <MinimalVoiceWaves
                  isListening
                  className="h-10 min-w-[88px]"
                  userSpeakingLevel={currentAudioLevel}
                />
              </div>
            </div>
          </div>
          {liveTranscriptSupported ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Söyledikleriniz
                </span>
                <span className={`text-xs font-medium ${liveStatusTone}`}>
                  {liveStatusLabel}
                </span>
              </div>
              <p className="min-h-[2.5rem] text-sm leading-relaxed text-slate-800">
                {liveSegments.map((segment, index) => (
                  <span
                    key={index}
                    className={isLowConfidenceSegment(segment.confidence)
                      ? 'text-amber-700 underline decoration-dotted decoration-amber-500 underline-offset-2'
                      : undefined}
                    title={isLowConfidenceSegment(segment.confidence) ? 'Bu kısım net anlaşılmadı' : undefined}
                  >
                    {segment.text}{' '}
                  </span>
                ))}
                {liveInterimText ? (
                  <span className="text-slate-400">{liveInterimText}</span>
                ) : liveSegments.length === 0 ? (
                  <span className="text-slate-400">Konuştuğunuzda kelimeler burada belirecek…</span>
                ) : null}
              </p>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Button onClick={finishCurrentAnswer} className="bg-brand-primary text-white hover:bg-brand-primary-hover" size="default">
              Yanıtı Bitir
            </Button>
            <Button onClick={() => void skipQuestion()} variant="outline" size="default">
              <SkipForward className="mr-2 h-4 w-4" />
              Atla
            </Button>
          </div>
        </div>
      );
    }

    if (isProcessingPhase) {
      return (
        <div className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-sky-700" />
            <span className="text-sm font-bold uppercase tracking-wide text-sky-700">
              Yanıt işleniyor
            </span>
          </div>
          <div className="rounded-xl bg-white/80 p-3 text-sm leading-relaxed text-slate-700">
            Kaydınız yazıya çevriliyor. Bu aşama tamamlanmazsa otomatik olarak kurtarma moduna geçeceğiz.
          </div>
        </div>
      );
    }

    if (isReviewPhase) {
      return (
        <div className="rounded-2xl border-2 border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-4">
            <span className="text-sm font-bold uppercase tracking-wide text-yellow-800">
              Yanıtı kontrol edin
            </span>
            <span className="text-xs text-yellow-700">
              Devam etmeden önce yanıtınızı düzenleyebilir veya doğrudan kaydedebilirsiniz.
            </span>
          </div>
          <Textarea
            value={editableTranscript}
            onChange={(event) => setEditableTranscript(event.target.value)}
            className="min-h-[108px] w-full resize-none text-sm font-medium leading-relaxed"
            placeholder="Yanıtınızı buraya yazın..."
          />
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Button onClick={() => void confirmAndSaveResponse()} className="bg-green-600 text-white hover:bg-green-700" size="default">
              Onayla ve Kaydet
            </Button>
            <Button onClick={() => void reRecordAnswer()} variant="outline" size="default">
              Tekrar Kaydet
            </Button>
            <Button onClick={() => void skipQuestion()} variant="outline" size="default">
              <SkipForward className="mr-2 h-4 w-4" />
              Atla
            </Button>
          </div>
        </div>
      );
    }

    if (isRecoveringPhase) {
      return (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-gradient-to-r from-gray-50 to-slate-50 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Mic className="h-5 w-5 text-gray-500" />
              <p className="text-sm font-medium leading-relaxed text-gray-700">
                {responseRecoveryMessage ?? 'Yanıt akışı aynı soruda kurtarma moduna alındı.'}
              </p>
            </div>
            {draftTranscript ? (
              <div className="rounded-xl bg-white/80 p-3 text-left shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Şu ana kadar kaydedilen kısım
                </p>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                  {draftTranscript}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2.5">
              <Button
                onClick={() => void beginAnswerCapture({ resetDuration: false, preserveDraft: resumeAfterFailure })}
                size="default"
                disabled={isStartingCapture}
                className="bg-brand-primary text-white hover:bg-brand-primary-hover"
              >
                {isStartingCapture ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {resumeAfterFailure ? 'Kaldığın Yerden Devam Et' : 'Tekrar Kaydet'}
              </Button>
              <Button onClick={() => void reRecordAnswer()} variant="outline" size="default" disabled={isStartingCapture}>
                Baştan Kaydet
              </Button>
              <Button onClick={() => void skipQuestion()} variant="outline" size="default" disabled={isStartingCapture}>
                <SkipForward className="mr-2 h-4 w-4" />
                Atla
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  if (!isActive) return null;

  if (showTurkishPreamble && isPreamblePhase) {
    return <TurkishPreambleDisplay projectContext={projectContext} onComplete={startActualQuestions} onSkip={startActualQuestions} />;
  }

  return (
    <div className="flex min-h-full flex-col bg-background lg:h-full lg:min-h-0 lg:overflow-hidden">
      {!showTurkishPreamble && (
        <>
          <div className="flex flex-1 flex-col overflow-hidden lg:min-h-0">
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col lg:min-h-0">
              {currentQuestion && !isPreamblePhase ? (
                <div className={`flex flex-1 flex-col lg:min-h-0 ${shouldShowSpeaker ? 'gap-3 lg:gap-2' : 'gap-2 lg:gap-1.5'}`}>
                  {shouldShowSpeaker ? (
                    <div className="flex shrink-0 justify-center">
                      <AvatarSpeaker
                        key={currentQuestion.id}
                        questionText={currentQuestion.question_text}
                        speechText={getQuestionSpeechText(currentQuestion)}
                        isUserResponding={isUserResponding}
                        compact
                        onSpeakingStart={() => {
                          if (
                            (interviewPhase as InterviewPhase) === 'idle' ||
                            (interviewPhase as InterviewPhase) === 'asking' ||
                            (interviewPhase as InterviewPhase) === 'awaiting_audio_playback'
                          ) {
                            setInterviewPhase('asking');
                          }
                          // Do not open the mic while Searcho is speaking — it is acquired
                          // only when the participant taps "Cevaplamaya Başla".
                        }}
                        onReadyToRespond={handleQuestionReadyToRespond}
                        onPlaybackInterrupted={handleQuestionPlaybackInterrupted}
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-1 flex-col overflow-hidden rounded-[28px] border bg-card p-4 shadow lg:min-h-0 lg:p-5">
                    <div className="shrink-0">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                            {isUsabilityTaskQuestion(currentQuestion)
                              ? 'Görev'
                              : `Soru ${Math.min(interviewProgress.completed + 1, Math.max(interviewProgress.total, 1))} / ${Math.max(interviewProgress.total, 1)}`}
                          </p>
                          {currentQuestion.section ? (
                            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                              {isUsabilityTaskQuestion(currentQuestion) ? <ClipboardList className="h-3.5 w-3.5" /> : null}
                              {currentQuestion.section}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">
                          {Math.round(interviewProgress.percentage)}% Tamamlandı
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all duration-500 ease-out"
                          style={{ width: `${interviewProgress.percentage}%` }}
                        />
                      </div>
                    </div>

                    <div className={`flex flex-1 flex-col gap-3 lg:min-h-0 ${shouldShowSpeaker ? 'mt-4 lg:mt-3' : 'mt-2'}`}>
                      {shouldUseCompactTimerRail ? (
                        <div className="shrink-0 rounded-2xl border border-border/70 bg-muted/20 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {responseTimerHeading}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {compactTimerSummary}
                              </p>
                            </div>
                            <div className={`shrink-0 text-lg font-semibold tabular-nums lg:text-xl ${responseTimerTone}`}>
                              {responseTimerLabel}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="shrink-0 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                                {responseTimerHeading}
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {responseTimerDescription}
                              </p>
                            </div>
                            <div className={`text-xl font-semibold tabular-nums lg:text-2xl ${responseTimerTone}`}>
                              {responseTimerLabel}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="shrink-0">
                        <h3 className={`font-semibold leading-snug text-foreground ${shouldUseCompactTimerRail ? 'text-base lg:text-lg' : 'text-lg lg:text-xl'}`}>
                          {currentQuestion.question_text}
                        </h3>
                      </div>

                      <div className={`flex-1 lg:min-h-0 ${isReviewPhase ? 'lg:overflow-y-auto' : 'lg:overflow-hidden'}`}>
                        {renderResponsePanel()}
                      </div>
                    </div>
                  </div>
                </div>
              ) : isCompletedPhase ? (
                <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.18),_transparent_40%),linear-gradient(180deg,_#ffffff_0%,_#f0fdf4_100%)] p-10 text-center shadow-[0_24px_70px_rgba(16,185,129,0.12)]">
                  <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.55),transparent)] opacity-80" />
                  <div className="relative flex flex-col items-center gap-5">
                    <div className="relative flex h-24 w-24 items-center justify-center">
                      <div className="absolute h-24 w-24 rounded-full bg-emerald-200/60 animate-ping" />
                      <div className="absolute h-20 w-20 rounded-full bg-emerald-100" />
                      <div className="relative rounded-full bg-emerald-500 p-4 text-white shadow-lg">
                        <CheckCircle2 className="h-10 w-10" />
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">
                      <Sparkles className="h-4 w-4" />
                      Oturum başarıyla tamamlandı
                    </div>
                    <div>
                      <h3 className="text-2xl font-semibold text-foreground">Görüşme tamamlandı</h3>
                      <p className="mt-3 text-muted-foreground">
                        Kamera ve mikrofon kapatıldı. İsterseniz şimdi oturumu kapatabilirsiniz.
                      </p>
                    </div>
                    <Button onClick={() => void onSessionEnd?.('completed')} size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700">
                      Oturumu Tamamla
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {!isCompletedPhase ? (
            <div className="shrink-0 border-t border-border bg-card/40 backdrop-blur-sm">
              <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2 lg:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${
                    isRecordingVideo
                      ? 'bg-red-50 text-red-700'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {isRecordingVideo ? 'Ses Kanıtı Açık' : 'Görüşme Aktif'}
                  </span>
                </div>

                <div className="font-mono text-[11px] text-muted-foreground lg:text-xs">
                  {getSessionDuration()}
                </div>

                <Button
                  onClick={() => setShowEndSessionConfirmation(true)}
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 px-3"
                  disabled={isEndingSession}
                >
                  <PhoneOff className="h-4 w-4" />
                  Oturumu Bitir
                </Button>
              </div>
            </div>
          ) : null}

          <AlertDialog open={showEndSessionConfirmation} onOpenChange={setShowEndSessionConfirmation}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Oturumu erken bitirmek istiyor musunuz?</AlertDialogTitle>
                <AlertDialogDescription>
                  Görüşme henüz tamamlanmadı. Şimdi bitirirseniz kalan sorular yanıtlanmamış olacak ve bu oturuma aynı linkle geri dönemeyeceksiniz.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isEndingSession}>Vazgeç</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async (event) => {
                    event.preventDefault();
                    setIsEndingSession(true);

                    try {
                      await onSessionEnd?.('manual');
                      setShowEndSessionConfirmation(false);
                    } catch (error) {
                      console.error('Failed to end session:', error);
                      toast({
                        title: 'Oturum bitirilemedi',
                        description: 'Lütfen tekrar deneyin.',
                        variant: 'destructive',
                      });
                    } finally {
                      setIsEndingSession(false);
                    }
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isEndingSession}
                >
                  {isEndingSession ? 'Bitiriliyor...' : 'Oturumu Bitir'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {import.meta.env.DEV ? (
            <div className="bg-slate-900 p-4 text-xs font-mono text-white">
              <div>Phase: {interviewPhase}</div>
              <div>Submitting: {isSubmittingResponse ? '✅' : '❌'}</div>
              <div>Recording audio evidence: {isRecordingVideo ? 'yes' : 'no'}</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default SearchoAI;
