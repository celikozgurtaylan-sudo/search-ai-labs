import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, Mic, PhoneOff, Play, SkipForward, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
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
import { AudioTranscriber, AudioTranscriberMetrics } from '@/utils/AudioTranscriber';
import { interviewService, InterviewProgress, InterviewQuestion, setInterviewSessionToken } from '@/services/interviewService';
import { prefetchTextToSpeech, resetTextToSpeechSessionState } from '@/services/textToSpeechService';
import TurkishPreambleDisplay from './TurkishPreambleDisplay';
import { AvatarSpeaker } from './AvatarSpeaker';

const RESPONSE_TIME_LIMIT_SECONDS = 120;
const PRE_SPEECH_PREP_LIMIT_SECONDS = 10;
const RECOVERY_GRACE_SECONDS = 30;
const AUTO_SAVE_MIN_CHARACTERS = 8;
const AUTO_SAVE_MIN_WORDS = 2;
const TRANSCRIPTION_HEALTHCHECK_TTL_MS = 30_000;
const TRANSCRIPTION_HEALTHCHECK_INTERVAL_MS = 10_000;
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
  | 'awaiting_start'
  | 'recording'
  | 'processing'
  | 'review'
  | 'recovering'
  | 'completed';

type CaptureStartOptions = {
  preserveDraft?: boolean;
  resetDuration?: boolean;
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
    discussionGuide?: any;
    researchMode?: 'structured' | 'ai_enhanced';
    aiEnhancedBrief?: any;
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
  onSessionEnd?: (reason?: 'manual' | 'completed') => void;
  onPreambleStateChange?: (isActive: boolean) => void;
  onQuestionChange?: (question: InterviewQuestion | null, progress: InterviewProgress) => void;
  onMediaReleaseRequested?: () => void;
}

const isLiveTrack = (track?: MediaStreamTrack | null) => Boolean(track && track.readyState === 'live' && track.enabled !== false);

const getRecordingMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return undefined;

  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
};

const shouldRequireTranscriptReview = (transcript: string) => {
  const normalizedTranscript = transcript.trim();
  const wordCount = normalizedTranscript.split(/\s+/).filter(Boolean).length;

  return normalizedTranscript.length < AUTO_SAVE_MIN_CHARACTERS || wordCount < AUTO_SAVE_MIN_WORDS;
};

const SearchoAI = ({
  isActive,
  cameraStream = null,
  projectContext,
  onSessionEnd,
  onPreambleStateChange,
  onQuestionChange,
  onMediaReleaseRequested,
}: SearchoAIProps) => {
  const { toast } = useToast();

  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);
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
  const [prepTimeRemaining, setPrepTimeRemaining] = useState(PRE_SPEECH_PREP_LIMIT_SECONDS);
  const [responseTimerExpired, setResponseTimerExpired] = useState(false);
  const [responseTimerActive, setResponseTimerActive] = useState(false);
  const [hasSpeechStartedForCurrentAttempt, setHasSpeechStartedForCurrentAttempt] = useState(false);
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isPreamblePhase, setIsPreamblePhase] = useState(true);
  const [showTurkishPreamble, setShowTurkishPreamble] = useState(true);
  const [showEndSessionConfirmation, setShowEndSessionConfirmation] = useState(false);
  const [draftTranscript, setDraftTranscript] = useState('');
  const [draftAudioDurationMs, setDraftAudioDurationMs] = useState(0);
  const [responseRecoveryMessage, setResponseRecoveryMessage] = useState<string | null>(null);
  const [resumeAfterFailure, setResumeAfterFailure] = useState(false);
  const [hasUsedRecoveryGrace, setHasUsedRecoveryGrace] = useState(false);

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

  const startTranscriptionHealthMonitor = useCallback(() => {
    clearTranscriptionHealthMonitor();
    transcriptionHealthMonitorRef.current = window.setInterval(() => {
      void ensureTranscriptionPipelineHealthy(true).then((isHealthy) => {
        if (!isHealthy) {
          audioTranscriberRef.current?.reportHealthIssue('TRANSCRIPTION_SERVICE_UNAVAILABLE');
        }
      });
    }, TRANSCRIPTION_HEALTHCHECK_INTERVAL_MS);
  }, [clearTranscriptionHealthMonitor, ensureTranscriptionPipelineHealthy]);

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
    const cameraTrack = cameraStream?.getVideoTracks().find((track) => isLiveTrack(track));
    const microphoneTrack = microphoneStream.getAudioTracks().find((track) => isLiveTrack(track));

    if (!cameraTrack || !microphoneTrack) {
      cleanupResponseRecording();
      return;
    }

    const tracks = [cameraTrack.clone(), microphoneTrack.clone()];
    const recordingStream = new MediaStream(tracks);
    const mimeType = getRecordingMimeType();

    try {
      const recorder = mimeType
        ? new MediaRecorder(recordingStream, { mimeType, videoBitsPerSecond: 2_500_000 })
        : new MediaRecorder(recordingStream, { videoBitsPerSecond: 2_500_000 });

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
      console.log('Started async response recording for question:', questionId);
    } catch (error) {
      console.error('Failed to start response recording:', error);
      tracks.forEach((track) => track.stop());
      cleanupResponseRecording();
    }
  }, [cameraStream, cleanupResponseRecording]);

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
    setHasSpeechStartedForCurrentAttempt(false);
  }, [clearTranscriptionHealthMonitor, invalidateCaptureAttempt, stopResponseRecording]);

  const uploadResponseMedia = useCallback(async (responseId: string, questionId: string, media: PendingResponseMedia) => {
    if (!projectContext?.sessionId || !media.blob) {
      return;
    }

    try {
      const base64Video = await blobToBase64(media.blob);
      await interviewService.attachResponseMedia(projectContext.sessionId, responseId, {
        videoDuration: Math.round(media.durationMs),
        audioDuration: Math.round(media.durationMs),
        metadata: {
          mediaUploadCompletedAt: new Date().toISOString(),
        },
        videoBase64: base64Video,
        videoMimeType: media.blob.type || 'video/webm',
        questionId,
      });
    } catch (error) {
      console.error('Background response media upload failed:', error);
    }
  }, [projectContext?.sessionId]);

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
    setPrepTimeRemaining(PRE_SPEECH_PREP_LIMIT_SECONDS);
    setHasSpeechStartedForCurrentAttempt(false);
    setResumeAfterFailure(shouldResume);
    setResponseRecoveryMessage(message);
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
  }, [clearProcessingWatchdog, draftTranscript, enterRecoveryState, shutdownActiveResponseCapture, toast]);

  const applyInterviewState = useCallback((nextQuestion: InterviewQuestion | null, progress: InterviewProgress) => {
    clearTranscriptionHealthMonitor();
    clearProcessingWatchdog();
    setCurrentQuestion(nextQuestion);
    setInterviewProgress(progress);
    onQuestionChange?.(nextQuestion, progress);
    setResponseTimerActive(false);
    setResponseTimerExpired(false);
    setResponseTimeRemaining(RESPONSE_TIME_LIMIT_SECONDS);
    setPrepTimeRemaining(PRE_SPEECH_PREP_LIMIT_SECONDS);
    setHasSpeechStartedForCurrentAttempt(false);
    setUserTranscript('');
    setEditableTranscript('');
    setDraftTranscript('');
    setDraftAudioDurationMs(0);
    setResponseRecoveryMessage(null);
    setResumeAfterFailure(false);
    setHasUsedRecoveryGrace(false);

    if (nextQuestion?.question_text) {
      setInterviewPhase('asking');
      void prefetchTextToSpeech(nextQuestion.question_text);
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
    if (!currentQuestion?.id) return;
    setResponseTimeRemaining(RESPONSE_TIME_LIMIT_SECONDS);
    setPrepTimeRemaining(PRE_SPEECH_PREP_LIMIT_SECONDS);
    setResponseTimerExpired(false);
    setResponseTimerActive(false);
    setHasSpeechStartedForCurrentAttempt(false);
    setHasUsedRecoveryGrace(false);
  }, [currentQuestion?.id]);

  useEffect(() => {
    if (!currentQuestion || interviewPhase !== 'recording' || !responseTimerActive || isSubmittingResponse) return;
    if (responseTimeRemaining <= 0) return;

    const timer = window.setInterval(() => {
      setResponseTimeRemaining((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentQuestion, interviewPhase, isSubmittingResponse, responseTimeRemaining, responseTimerActive]);

  useEffect(() => {
    if (
      !currentQuestion ||
      interviewPhase !== 'recording' ||
      responseTimerActive ||
      hasSpeechStartedForCurrentAttempt ||
      isSubmittingResponse
    ) {
      return;
    }

    if (prepTimeRemaining <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setPrepTimeRemaining((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentQuestion, hasSpeechStartedForCurrentAttempt, interviewPhase, isSubmittingResponse, prepTimeRemaining, responseTimerActive]);

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
        ? 'Şimdi anchor omurgayla başlayan AI enhanced görüşmeye geçiyoruz.'
        : 'Şimdi yapılandırılmış görüşme sorularına başlıyoruz.',
    });
  }, [getNextQuestion, projectContext?.researchMode, toast]);

  const submitCurrentResponse = useCallback(async (transcription: string) => {
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
        audioDuration: Math.round(Math.max(mediaToPersist.durationMs, draftAudioDurationMs)),
        metadata: {
          timestamp: new Date().toISOString(),
          questionText: activeQuestion.question_text,
          questionType: activeQuestion.question_type,
          isFollowUp: activeQuestion.is_follow_up,
          questionMetadata: activeQuestion.metadata ?? {},
          autoSaved: true,
          usedDraftTranscript: draftTranscript.trim().length > 0,
        },
      });

      setDraftTranscript('');
      setDraftAudioDurationMs(0);
      applyInterviewState(data.nextQuestion, data.progress);

      if (mediaToPersist.blob && data.response?.id) {
        void uploadResponseMedia(data.response.id, activeQuestion.id, mediaToPersist);
      }
    } catch (error) {
      console.error('Failed to submit response:', error);
      pendingResponseMediaRef.current = mediaToPersist;
      setEditableTranscript(normalizedTranscript);
      setUserTranscript(normalizedTranscript);
      setInterviewPhase('review');
      toast({
        title: 'Hata',
        description: 'Yanıt kaydedilemedi. Düzeltip tekrar deneyin.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingResponse(false);
    }
  }, [applyInterviewState, currentQuestion, draftAudioDurationMs, draftTranscript, projectContext?.participantId, projectContext?.sessionId, stopResponseRecording, uploadResponseMedia]);

  const beginAnswerCapture = useCallback(async (options?: CaptureStartOptions) => {
    const preserveDraft = options?.preserveDraft ?? true;
    const resetDuration = options?.resetDuration ?? false;
    const nextDraftTranscript = preserveDraft ? draftTranscript : '';
    const attemptId = invalidateCaptureAttempt();

    if (!currentQuestion?.id || isSubmittingResponse || interviewPhase === 'completed') {
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
      setDraftAudioDurationMs(0);
    }

    if (resetDuration) {
      setResponseTimeRemaining(RESPONSE_TIME_LIMIT_SECONDS);
      setHasUsedRecoveryGrace(false);
    }

    setResumeAfterFailure(false);
    setResponseRecoveryMessage(null);
    setUserTranscript(nextDraftTranscript);
    setEditableTranscript(nextDraftTranscript);
    setInterviewPhase('recording');
    setResponseTimerExpired(false);
    setResponseTimerActive(false);
    setPrepTimeRemaining(PRE_SPEECH_PREP_LIMIT_SECONDS);
    setHasSpeechStartedForCurrentAttempt(false);

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

        setHasSpeechStartedForCurrentAttempt(true);
        setResponseTimerActive(true);
        startTranscriptionHealthMonitor();
      };
      transcriber.onDebugMetrics = (metrics: AudioTranscriberMetrics) => {
        if (import.meta.env.DEV) {
          console.debug('Audio transcriber metrics:', metrics);
        }
      };
      transcriber.onComplete = async (finalText: string) => {
        if (captureAttemptRef.current !== attemptId) {
          return;
        }

        audioTranscriberRef.current = null;
        clearTranscriptionHealthMonitor();
        clearProcessingWatchdog();
        setResponseTimerActive(false);
        setResponseRecoveryMessage(null);
        setResumeAfterFailure(false);

        const recording = await stopResponseRecording(false);
        if (captureAttemptRef.current !== attemptId || !currentQuestion?.id) {
          return;
        }

        const normalizedTranscript = mergeTranscriptSegments(draftTranscript, finalText.trim());
        const totalDurationMs = draftAudioDurationMs + recording.durationMs;
        setDraftTranscript(normalizedTranscript);
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
        setHasSpeechStartedForCurrentAttempt(false);

        await discardPendingResponseMedia();
        if (captureAttemptRef.current !== attemptId) {
          return;
        }

        if (error === 'PREP_TIMEOUT') {
          setUserTranscript(draftTranscript);
          setEditableTranscript(draftTranscript);
          enterRecoveryState('Soruyu duyduysanız şimdi konuşmaya başlayabilirsiniz. İlk 10 saniyede ses algılanmadı.', {
            resume: false,
            allowGraceIfNeeded: false,
          });
          toast({
            title: 'Konuşma başlamadı',
            description: 'Yanıta başlamak için “Konuşmaya Başla” düğmesinden sonra 10 saniye içinde konuşmanız gerekiyor.',
          });
          return;
        }

        if (error === 'NO_SPEECH_DETECTED') {
          setUserTranscript(draftTranscript);
          setEditableTranscript(draftTranscript);
          enterRecoveryState('Ses net algılanamadı. Aynı soruda yeniden kayıt alabilirsiniz.', {
            resume: false,
            allowGraceIfNeeded: false,
          });
          toast({
            title: 'Ses algılanamadı',
            description: 'Yanıtınız net algılanmadı. Mikrofonu kontrol edip tekrar deneyin.',
          });
          return;
        }

        const isSystemFailure = [
          'TRANSCRIPTION_FAILED',
          'TRANSCRIPTION_TIMEOUT',
          'TRANSCRIPTION_EMPTY',
          'RECORDING_HEALTH_FAILURE',
          'TRANSCRIPTION_SERVICE_UNAVAILABLE',
          'MICROPHONE_DISCONNECTED',
        ].includes(error);

        if (isSystemFailure) {
          setUserTranscript(draftTranscript);
          setEditableTranscript(draftTranscript);
          enterRecoveryState(
            responseTimeRemaining <= 0 && !hasUsedRecoveryGrace
              ? 'Kayıt ya da transcript zincirinde sorun algılandı. Aynı soruda devam etmeniz için 30 saniyelik ek süre tanındı.'
              : 'Kayıt ya da transcript zincirinde sorun algılandı. Yanıtınızın boşa gitmemesi için aynı soruda kurtarma moduna alındınız.',
            {
              resume: true,
              allowGraceIfNeeded: true,
            },
          );
          toast({
            title: 'Yanıt kurtarma moduna alındı',
            description: 'Aynı soruda kaldığınız yerden devam edebilir veya yeniden kayıt alabilirsiniz.',
            variant: 'destructive',
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
      await transcriber.start(microphoneStream);
    } catch (error) {
      if (captureAttemptRef.current !== attemptId) {
        return;
      }

      console.error('Failed to start listening:', error);
      clearTranscriptionHealthMonitor();
      enterRecoveryState('Mikrofon başlatılamadı. Aynı soruda yeniden deneyebilirsiniz.', {
        resume: true,
        allowGraceIfNeeded: false,
      });
      toast({
        title: 'Mikrofon Hatası',
        description: 'Mikrofon başlatılamadı. Lütfen tekrar deneyin.',
        variant: 'destructive',
      });
    }
  }, [
    clearProcessingWatchdog,
    clearTranscriptionHealthMonitor,
    currentQuestion,
    discardPendingResponseMedia,
    draftAudioDurationMs,
    draftTranscript,
    ensureMicrophoneStream,
    ensureTranscriptionPipelineHealthy,
    enterRecoveryState,
    hasUsedRecoveryGrace,
    interviewPhase,
    invalidateCaptureAttempt,
    isSubmittingResponse,
    mergeTranscriptSegments,
    persistDraftResponse,
    responseTimeRemaining,
    startResponseRecording,
    startTranscriptionHealthMonitor,
    stopResponseRecording,
    toast,
  ]);

  const reRecordAnswer = useCallback(async () => {
    setUserTranscript('');
    setEditableTranscript('');
    setResponseRecoveryMessage(null);
    setResumeAfterFailure(false);
    setDraftTranscript('');
    setDraftAudioDurationMs(0);
    setResponseTimeRemaining(RESPONSE_TIME_LIMIT_SECONDS);
    setPrepTimeRemaining(PRE_SPEECH_PREP_LIMIT_SECONDS);
    setResponseTimerExpired(false);
    setResponseTimerActive(false);
    setHasSpeechStartedForCurrentAttempt(false);
    setHasUsedRecoveryGrace(false);
    await beginAnswerCapture({ resetDuration: true, preserveDraft: false });
  }, [beginAnswerCapture]);

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
  const isAwaitingStartPhase = interviewPhase === 'awaiting_start';
  const isProcessingPhase = interviewPhase === 'processing';
  const isReviewPhase = interviewPhase === 'review';
  const isRecoveringPhase = interviewPhase === 'recovering';
  const isCompletedPhase = interviewPhase === 'completed' || interviewProgress.isComplete;
  const isInPrepWindow = isRecordingPhase && !hasSpeechStartedForCurrentAttempt && !responseTimerActive;
  const isUserResponding = isRecordingPhase || isReviewPhase || isProcessingPhase || isSubmittingResponse || Boolean(userTranscript);

  const responseTimerLabel = isAwaitingStartPhase
    ? 'Hazır'
    : formatTimerLabel(isInPrepWindow ? prepTimeRemaining : responseTimeRemaining);
  const responseTimerHeading = isAwaitingStartPhase
    ? 'Konuşma başlangıcı'
    : isInPrepWindow
      ? 'Hazırlık süresi'
      : 'Yanıt süresi';
  const responseTimerDescription = isAwaitingStartPhase
    ? 'Soruyu bitirdiğinizde aşağıdaki düğmeyle kaydı başlatın.'
    : isInPrepWindow
      ? '“Konuşmaya Başla” sonrasında 10 sn içinde ilk cümlenizi söyleyin. İlk sesinizle 2 dk başlar.'
      : 'Konuşmaya başladıktan sonra 2 dk boyunca yanıt verebilirsiniz.';
  const responseTimerTone = isAwaitingStartPhase
    ? 'text-foreground'
    : isInPrepWindow
      ? prepTimeRemaining <= 3
        ? 'text-red-600'
        : prepTimeRemaining <= 5
          ? 'text-amber-600'
          : 'text-foreground'
      : responseTimeRemaining <= 10
        ? 'text-red-600'
        : responseTimeRemaining <= 30
          ? 'text-amber-600'
          : 'text-foreground';

  const renderResponsePanel = () => {
    if (isSubmittingResponse) {
      return (
        <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm font-bold uppercase tracking-wide text-blue-700">
              Yanıt kaydediliyor
            </span>
          </div>
          <div className="rounded-xl bg-white/80 p-4 text-base text-slate-700">
            {userTranscript || 'Yanıtınız güvenli şekilde kaydediliyor...'}
          </div>
        </div>
      );
    }

    if (interviewPhase === 'asking') {
      return (
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-5">
          <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Soru seslendiriliyor. Ses tamamlanınca “Konuşmaya Başla” düğmesi aktif olacak.
          </div>
        </div>
      );
    }

    if (isAwaitingStartPhase) {
      return (
        <div className="rounded-2xl border-2 border-brand-primary/20 bg-[linear-gradient(180deg,rgba(124,77,255,0.08),rgba(255,255,255,0.96))] p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-primary">
                Hazırsanız siz başlayın
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Soruyu duyduysanız yanıt kaydını manuel olarak başlatın. Hazırlık süresi düğmeye bastığınızda başlayacak.
              </p>
            </div>
            <Button onClick={() => void beginAnswerCapture({ preserveDraft: true, resetDuration: false })} size="lg" className="gap-2 bg-brand-primary text-white hover:bg-brand-primary-hover">
              <Play className="h-4 w-4" />
              Konuşmaya Başla
            </Button>
          </div>
        </div>
      );
    }

    if (isRecordingPhase) {
      return (
        <div className="rounded-2xl border-2 border-red-300 bg-gradient-to-r from-red-50 to-pink-50 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <div className="relative">
              <div className="h-4 w-4 rounded-full bg-red-500 animate-pulse" />
              <div className="absolute inset-0 h-4 w-4 rounded-full bg-red-500 animate-ping" />
            </div>
            <span className="text-sm font-bold uppercase tracking-wide text-red-700">
              {isInPrepWindow ? 'Konuşma başlangıcı bekleniyor' : 'Kayıt alınıyor'}
            </span>
          </div>
          <div className="rounded-xl bg-white/80 p-4">
            <p className="text-base font-medium leading-relaxed text-slate-800">
              {isInPrepWindow
                ? 'İlk cümlenizi şimdi söyleyin. Ses algılandığında yanıt süresi başlayacak.'
                : 'Yanıtınız kaydediliyor. Bitirdiğinizde “Yanıtı Bitir” düğmesini kullanın.'}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={finishCurrentAnswer} className="bg-brand-primary text-white hover:bg-brand-primary-hover" size="lg">
              Yanıtı Bitir
            </Button>
            <Button onClick={() => void skipQuestion()} variant="outline" size="lg">
              <SkipForward className="mr-2 h-4 w-4" />
              Atla
            </Button>
          </div>
        </div>
      );
    }

    if (isProcessingPhase) {
      return (
        <div className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-sky-700" />
            <span className="text-sm font-bold uppercase tracking-wide text-sky-700">
              Yanıt işleniyor
            </span>
          </div>
          <div className="rounded-xl bg-white/80 p-4 text-base leading-relaxed text-slate-700">
            Kaydınız yazıya çevriliyor. Bu aşama tamamlanmazsa otomatik olarak kurtarma moduna geçeceğiz.
          </div>
        </div>
      );
    }

    if (isReviewPhase) {
      return (
        <div className="rounded-2xl border-2 border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 p-5 shadow-sm">
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
            className="min-h-[120px] w-full resize-none text-base font-medium leading-relaxed"
            placeholder="Yanıtınızı buraya yazın..."
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => void confirmAndSaveResponse()} className="bg-green-600 text-white hover:bg-green-700" size="lg">
              Onayla ve Kaydet
            </Button>
            <Button onClick={() => void reRecordAnswer()} variant="outline" size="lg">
              Tekrar Kaydet
            </Button>
            <Button onClick={() => void skipQuestion()} variant="outline" size="lg">
              <SkipForward className="mr-2 h-4 w-4" />
              Atla
            </Button>
          </div>
        </div>
      );
    }

    if (isRecoveringPhase) {
      return (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-gradient-to-r from-gray-50 to-slate-50 p-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Mic className="h-6 w-6 text-gray-500" />
              <p className="text-base font-medium leading-relaxed text-gray-700">
                {responseRecoveryMessage ?? 'Yanıt akışı aynı soruda kurtarma moduna alındı.'}
              </p>
            </div>
            {draftTranscript ? (
              <div className="rounded-xl bg-white/80 p-4 text-left shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Şu ana kadar kaydedilen kısım
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {draftTranscript}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void beginAnswerCapture({ resetDuration: false, preserveDraft: resumeAfterFailure })} size="lg" className="bg-brand-primary text-white hover:bg-brand-primary-hover">
                {resumeAfterFailure ? 'Kaldığın Yerden Devam Et' : 'Tekrar Kaydet'}
              </Button>
              <Button onClick={() => void reRecordAnswer()} variant="outline" size="lg">
                Baştan Kaydet
              </Button>
              <Button onClick={() => void skipQuestion()} variant="outline" size="lg">
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
    <div className="flex min-h-full flex-col bg-background xl:h-full">
      {!showTurkishPreamble && (
        <>
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col xl:min-h-0">
              {currentQuestion && !isPreamblePhase ? (
                <div className="flex flex-1 flex-col gap-4 xl:min-h-0">
                  <div className="flex shrink-0 justify-center">
                    <AvatarSpeaker
                      key={currentQuestion.id}
                      questionText={currentQuestion.question_text}
                      isUserResponding={isUserResponding}
                      onSpeakingStart={() => {
                        setInterviewPhase('asking');
                        void ensureMicrophoneStream();
                      }}
                      onSpeakingComplete={() => {
                        setInterviewPhase('awaiting_start');
                      }}
                    />
                  </div>

                  <div className="flex flex-1 flex-col overflow-hidden rounded-[28px] border bg-card p-5 shadow xl:min-h-0 xl:p-6">
                    <div className="shrink-0">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                            Soru {Math.min(interviewProgress.completed + 1, Math.max(interviewProgress.total, 1))} / {Math.max(interviewProgress.total, 1)}
                          </p>
                          {currentQuestion.section ? (
                            <span className="mt-2 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                              {currentQuestion.section}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">
                          {Math.round(interviewProgress.percentage)}% Tamamlandı
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all duration-500 ease-out"
                          style={{ width: `${interviewProgress.percentage}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-5 flex flex-1 flex-col gap-5 xl:min-h-0">
                      <div className="shrink-0 rounded-2xl border border-border/70 bg-muted/30 px-4 py-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                              {responseTimerHeading}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {responseTimerDescription}
                            </p>
                          </div>
                          <div className={`text-2xl font-semibold tabular-nums ${responseTimerTone}`}>
                            {responseTimerLabel}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        <h3 className="text-xl font-semibold leading-relaxed text-foreground">
                          {currentQuestion.question_text}
                        </h3>
                      </div>

                      <div className="flex-1 xl:min-h-0 xl:overflow-y-auto">
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
                    <Button onClick={() => onSessionEnd?.('completed')} size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700">
                      Oturumu Tamamla
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {!isCompletedPhase ? (
            <div className="border-t border-border bg-card/50 backdrop-blur-sm">
              <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
                <div className="flex items-center gap-3">
                  {isRecordingVideo ? (
                    <span className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      Video kaydı alınıyor
                    </span>
                  ) : (
                    <span className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      Görüşme aktif
                    </span>
                  )}
                </div>

                <div className="font-mono text-sm text-muted-foreground">
                  {getSessionDuration()}
                </div>

                <Button
                  onClick={() => setShowEndSessionConfirmation(true)}
                  variant="destructive"
                  size="lg"
                  className="gap-2"
                >
                  <PhoneOff className="h-5 w-5" />
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
                  Görüşme henüz tamamlanmadı. Şimdi bitirirseniz kalan sorular yanıtlanmamış olacak.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setShowEndSessionConfirmation(false);
                    onSessionEnd?.('manual');
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Oturumu Bitir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {import.meta.env.DEV ? (
            <div className="bg-slate-900 p-4 text-xs font-mono text-white">
              <div>Phase: {interviewPhase}</div>
              <div>Submitting: {isSubmittingResponse ? '✅' : '❌'}</div>
              <div>Recording video: {isRecordingVideo ? '✅' : '❌'}</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default SearchoAI;
