import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, Mic, MicOff, PhoneOff, SkipForward, Sparkles } from 'lucide-react';
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

type ResponseRecordingResult = {
  blob: Blob | null;
  durationMs: number;
};

type PendingResponseMedia = ResponseRecordingResult & {
  questionId: string;
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
    researchMode?: "structured" | "ai_enhanced";
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
}: SearchoAIProps) => {
  const { toast } = useToast();

  const [isListening, setIsListening] = useState(false);
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
  const [isWaitingForAnswer, setIsWaitingForAnswer] = useState(false);
  const [needsRetryRecording, setNeedsRetryRecording] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isReviewingTranscript, setIsReviewingTranscript] = useState(false);
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

  const clearTranscriptionHealthMonitor = useCallback(() => {
    if (transcriptionHealthMonitorRef.current) {
      window.clearInterval(transcriptionHealthMonitorRef.current);
      transcriptionHealthMonitorRef.current = null;
    }
  }, []);

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

    setIsListening(false);
    setIsTranscribing(false);
    setIsWaitingForAnswer(true);
    setIsReviewingTranscript(false);
    setResponseTimerActive(false);
    setResponseTimerExpired(false);
    setPrepTimeRemaining(PRE_SPEECH_PREP_LIMIT_SECONDS);
    setHasSpeechStartedForCurrentAttempt(false);
    setNeedsRetryRecording(true);
    setResumeAfterFailure(shouldResume);
    setResponseRecoveryMessage(message);
  }, [hasUsedRecoveryGrace, responseTimeRemaining]);

  const applyInterviewState = useCallback((nextQuestion: InterviewQuestion | null, progress: InterviewProgress) => {
    clearTranscriptionHealthMonitor();
    setCurrentQuestion(nextQuestion);
    setInterviewProgress(progress);
    onQuestionChange?.(nextQuestion, progress);
    setIsWaitingForAnswer(false);
    setNeedsRetryRecording(false);
    setResponseTimerActive(false);
    setResponseTimerExpired(false);
    setResponseTimeRemaining(RESPONSE_TIME_LIMIT_SECONDS);
    setPrepTimeRemaining(PRE_SPEECH_PREP_LIMIT_SECONDS);
    setHasSpeechStartedForCurrentAttempt(false);
    setUserTranscript('');
    setEditableTranscript('');
    setIsReviewingTranscript(false);
    setDraftTranscript('');
    setDraftAudioDurationMs(0);
    setResponseRecoveryMessage(null);
    setResumeAfterFailure(false);
    setHasUsedRecoveryGrace(false);

    if (nextQuestion?.question_text) {
      void prefetchTextToSpeech(nextQuestion.question_text);
    }

    if (progress.isComplete && !analysisTriggeredRef.current) {
      analysisTriggeredRef.current = true;
      setCurrentQuestion(null);
      toast({
        title: 'Görüşme Tamamlandı!',
        description: 'Tüm sorular yanıtlandı.',
      });
      toast({
        title: 'Analiz Hazırlanıyor',
        description: 'Araştırma raporu arka planda güncellenecek.',
      });
    }
  }, [clearTranscriptionHealthMonitor, onQuestionChange, projectContext?.projectId, projectContext?.sessionId, toast]);

  const initializeInterviewQuestions = useCallback(async () => {
    const hasStructuredGuide = Boolean(projectContext?.discussionGuide);
    const hasAIEnhancedBrief = projectContext?.researchMode === "ai_enhanced" && Boolean(projectContext?.aiEnhancedBrief);

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
        description: projectContext?.researchMode === "ai_enhanced"
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
      (projectContext?.discussionGuide || (projectContext?.researchMode === "ai_enhanced" && projectContext?.aiEnhancedBrief)) &&
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
    if (!currentQuestion || !responseTimerActive || isReviewingTranscript || isSubmittingResponse) return;
    if (responseTimeRemaining <= 0) return;

    const timer = window.setInterval(() => {
      setResponseTimeRemaining((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentQuestion, isReviewingTranscript, isSubmittingResponse, responseTimeRemaining, responseTimerActive]);

  useEffect(() => {
    if (!currentQuestion || !isListening || responseTimerActive || hasSpeechStartedForCurrentAttempt || isReviewingTranscript || isSubmittingResponse) {
      return;
    }

    if (prepTimeRemaining <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setPrepTimeRemaining((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentQuestion, hasSpeechStartedForCurrentAttempt, isListening, isReviewingTranscript, isSubmittingResponse, prepTimeRemaining, responseTimerActive]);

  const finishCurrentAnswer = useCallback(() => {
    if (!audioTranscriberRef.current) {
      return;
    }

    setIsListening(false);
    setResponseTimerActive(false);
    clearTranscriptionHealthMonitor();
    audioTranscriberRef.current.stop();
  }, [clearTranscriptionHealthMonitor]);

  useEffect(() => {
    if (!currentQuestion || responseTimeRemaining > 0 || responseTimerExpired || !responseTimerActive) return;

    setResponseTimerExpired(true);
    setResponseTimerActive(false);
    toast({
      title: 'Süre doldu',
      description: 'Kaydı tamamlayıp yanıtı şimdi işleyeceğiz.',
    });
    finishCurrentAnswer();
  }, [currentQuestion, finishCurrentAnswer, responseTimeRemaining, responseTimerActive, responseTimerExpired, toast]);

  const getNextQuestion = useCallback(async () => {
    if (!projectContext?.sessionId) return;

    setUserTranscript('');
    setEditableTranscript('');
    setIsReviewingTranscript(false);
    setNeedsRetryRecording(false);

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
      description: projectContext?.researchMode === "ai_enhanced"
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
    setIsReviewingTranscript(false);
    setIsWaitingForAnswer(false);
    setNeedsRetryRecording(false);
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
      setResponseRecoveryMessage(null);
      setResumeAfterFailure(false);
      applyInterviewState(data.nextQuestion, data.progress);

      if (mediaToPersist.blob && data.response?.id) {
        void uploadResponseMedia(data.response.id, activeQuestion.id, mediaToPersist);
      }
    } catch (error) {
      console.error('Failed to submit response:', error);
      pendingResponseMediaRef.current = mediaToPersist;
      setEditableTranscript(normalizedTranscript);
      setUserTranscript(normalizedTranscript);
      setIsReviewingTranscript(true);
      toast({
        title: 'Hata',
        description: 'Yanıt kaydedilemedi. Düzeltip tekrar deneyin.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingResponse(false);
    }
  }, [applyInterviewState, currentQuestion, draftAudioDurationMs, draftTranscript, projectContext?.participantId, projectContext?.sessionId, stopResponseRecording, toast, uploadResponseMedia]);

  const startListening = useCallback(async (options?: { resetDuration?: boolean; preserveDraft?: boolean }) => {
    const resetDuration = options?.resetDuration ?? false;
    const preserveDraft = options?.preserveDraft ?? true;
    const nextDraftTranscript = preserveDraft ? draftTranscript : '';

    if (!currentQuestion?.id || isSubmittingResponse) {
      return;
    }

    if (audioTranscriberRef.current) {
      audioTranscriberRef.current.cancel();
      audioTranscriberRef.current = null;
    }

    clearTranscriptionHealthMonitor();
    await discardPendingResponseMedia();

    if (resetDuration) {
      setDraftTranscript('');
      setDraftAudioDurationMs(0);
      setResponseTimeRemaining(RESPONSE_TIME_LIMIT_SECONDS);
      setHasUsedRecoveryGrace(false);
    }

    if (!preserveDraft) {
      setDraftTranscript('');
      setDraftAudioDurationMs(0);
    }

    setNeedsRetryRecording(false);
    setResumeAfterFailure(false);
    setResponseRecoveryMessage(null);
    setUserTranscript(nextDraftTranscript);
    setEditableTranscript(nextDraftTranscript);
    setIsReviewingTranscript(false);
    setIsTranscribing(true);
    setIsListening(true);
    setIsWaitingForAnswer(true);
    setResponseTimerExpired(false);
    setResponseTimerActive(false);
    setPrepTimeRemaining(PRE_SPEECH_PREP_LIMIT_SECONDS);
    setHasSpeechStartedForCurrentAttempt(false);

    try {
      const microphoneStream = await ensureMicrophoneStream();
      const isTranscriptionHealthy = await ensureTranscriptionPipelineHealthy();
      if (!isTranscriptionHealthy) {
        setIsListening(false);
        setIsTranscribing(false);
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

      const transcriber = new AudioTranscriber();
      transcriber.onSpeechDetected = () => {
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
        audioTranscriberRef.current = null;
        clearTranscriptionHealthMonitor();
        setIsListening(false);
        setIsTranscribing(false);
        setIsWaitingForAnswer(false);
        setResponseTimerActive(false);
        setNeedsRetryRecording(false);
        setResumeAfterFailure(false);
        setResponseRecoveryMessage(null);

        const recording = await stopResponseRecording(false);
        const normalizedTranscript = mergeTranscriptSegments(draftTranscript, finalText.trim());
        const totalDurationMs = draftAudioDurationMs + recording.durationMs;
        setDraftTranscript(normalizedTranscript);
        setDraftAudioDurationMs(totalDurationMs);
        setUserTranscript(normalizedTranscript);

        pendingResponseMediaRef.current = { ...recording, questionId: currentQuestion.id };
        await persistDraftResponse(normalizedTranscript, totalDurationMs);

        setEditableTranscript(normalizedTranscript);
        setIsReviewingTranscript(true);
        toast({
          title: 'Yanıtı gözden geçirin',
          description: shouldRequireTranscriptReview(normalizedTranscript)
            ? 'Transkript kısa görünüyor. Düzenleyip kaydetmeniz önerilir.'
            : 'Kaydetmeden önce yanıtınızı düzenleyebilir veya olduğu gibi onaylayabilirsiniz.',
        });
      };
      transcriber.onError = async (error: string) => {
        audioTranscriberRef.current = null;
        clearTranscriptionHealthMonitor();
        setIsTranscribing(false);
        setIsListening(false);
        setResponseTimerActive(false);
        setHasSpeechStartedForCurrentAttempt(false);

        await discardPendingResponseMedia();

        if (error === 'PREP_TIMEOUT' || error === 'NO_SPEECH_DETECTED') {
          setUserTranscript(draftTranscript);
          setEditableTranscript(draftTranscript);
          enterRecoveryState('10 saniye içinde konuşma başlamadı. Aynı soruda yeniden deneyebilirsiniz.', {
            resume: false,
            allowGraceIfNeeded: false,
          });
          toast({
            title: 'Ses algılanmadı',
            description: 'Yanıta başlamak için 10 saniye içinde konuşmanız gerekiyor.',
          });
          return;
        }

        const isSystemFailure = [
          'TRANSCRIPTION_FAILED',
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
              : 'Kayıt ya da transcript zincirinde sorun algılandı. Yanıtınızın boşa gitmemesi için kayıt durduruldu; aynı soruda kaldığınız yerden devam edebilirsiniz.',
            {
              resume: true,
              allowGraceIfNeeded: true,
            },
          );
          toast({
            title: 'Kayıt durduruldu',
            description: 'Yanıt kaybını önlemek için aynı soruda devam moduna alındınız.',
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
      console.error('Failed to start listening:', error);
      clearTranscriptionHealthMonitor();
      setIsListening(false);
      setIsTranscribing(false);
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
    clearTranscriptionHealthMonitor,
    currentQuestion,
    discardPendingResponseMedia,
    draftAudioDurationMs,
    draftTranscript,
    ensureMicrophoneStream,
    ensureTranscriptionPipelineHealthy,
    enterRecoveryState,
    hasUsedRecoveryGrace,
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
    setIsReviewingTranscript(false);
    setUserTranscript('');
    setEditableTranscript('');
    setIsWaitingForAnswer(true);
    setNeedsRetryRecording(false);
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
    await startListening({ resetDuration: true, preserveDraft: false });
  }, [startListening]);

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
      clearTranscriptionHealthMonitor();
      if (audioTranscriberRef.current) {
        audioTranscriberRef.current.cancel();
        audioTranscriberRef.current = null;
      }

      await discardPendingResponseMedia();
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
  }, [applyInterviewState, clearTranscriptionHealthMonitor, currentQuestion, discardPendingResponseMedia, projectContext?.sessionId, toast]);

  const toggleMicrophone = useCallback(() => {
    if (isListening || isTranscribing) {
      finishCurrentAnswer();
      return;
    }

    void startListening();
  }, [finishCurrentAnswer, isListening, isTranscribing, startListening]);

  useEffect(() => {
    return () => {
      clearTranscriptionHealthMonitor();
      if (audioTranscriberRef.current) {
        audioTranscriberRef.current.cancel();
        audioTranscriberRef.current = null;
      }

      void stopResponseRecording(true);
      pendingResponseMediaRef.current = null;
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
    };
  }, [clearTranscriptionHealthMonitor, stopResponseRecording]);

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

  const isInPrepWindow = isListening && !hasSpeechStartedForCurrentAttempt && !responseTimerActive;
  const responseTimerLabel = formatTimerLabel(isInPrepWindow ? prepTimeRemaining : responseTimeRemaining);
  const responseTimerHeading = isInPrepWindow ? 'Hazırlık süresi' : 'Yanıt süresi';
  const responseTimerDescription = isInPrepWindow
    ? '10 sn içinde konuşmaya başlayın. İlk sesinizle 2 dk başlar.'
    : 'Konuşmaya başladıktan sonra 2 dk boyunca yanıt verebilirsiniz.';
  const responseTimerTone = isInPrepWindow
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

  if (!isActive) return null;

  if (showTurkishPreamble && isPreamblePhase) {
    return <TurkishPreambleDisplay projectContext={projectContext} onComplete={startActualQuestions} onSkip={startActualQuestions} />;
  }

  return (
    <div className="min-h-full flex flex-col bg-background">
      {!showTurkishPreamble && (
        <>
          <div className="flex-1 flex flex-col items-center px-0 py-0">
            <div className="w-full max-w-4xl space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Soru {Math.min(interviewProgress.completed + 1, Math.max(interviewProgress.total, 1))} / {Math.max(interviewProgress.total, 1)}
                </div>
              </div>

              {currentQuestion && !isPreamblePhase ? (
                <div className="space-y-6">
                  <div className="flex justify-center">
                    <AvatarSpeaker
                      key={currentQuestion.id}
                      questionText={currentQuestion.question_text}
                      isUserResponding={isListening || isTranscribing || isReviewingTranscript || isSubmittingResponse || Boolean(userTranscript)}
                      onSpeakingStart={() => {
                        setIsWaitingForAnswer(false);
                        void ensureMicrophoneStream();
                      }}
                      onSpeakingComplete={() => {
                        void startListening();
                      }}
                    />
                  </div>

                  <div className="bg-card rounded-xl p-6 shadow border">
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-primary uppercase tracking-wide">
                          Soru {interviewProgress.completed + 1} / {interviewProgress.total}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {Math.round(interviewProgress.percentage)}% Tamamlandı
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-500 ease-out"
                          style={{ width: `${interviewProgress.percentage}%` }}
                        />
                      </div>
                    </div>

                    {currentQuestion.section ? (
                      <span className="inline-block px-3 py-1 text-xs font-medium text-primary bg-primary/10 rounded-full">
                        {currentQuestion.section}
                      </span>
                    ) : null}

                    <div className="space-y-2 mt-4">
                      <h3 className="text-xl font-semibold text-foreground leading-relaxed">
                        {currentQuestion.question_text}
                      </h3>
                    </div>

                    <div className="mt-5 rounded-2xl border border-border/70 bg-muted/30 px-4 py-4">
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

                    <div className="mt-6 min-h-[120px]">
                      {isSubmittingResponse ? (
                        <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-6 shadow-lg">
                          <div className="flex items-center gap-3 mb-3">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                            <span className="text-sm font-bold uppercase tracking-wide text-blue-700">
                              Yanıt kaydediliyor
                            </span>
                          </div>
                          <div className="rounded-xl bg-white/80 p-4 text-base text-slate-700">
                            {userTranscript || 'Yanıtınız güvenli şekilde kaydediliyor...'}
                          </div>
                        </div>
                      ) : isTranscribing ? (
                        <div className="bg-gradient-to-r from-red-50 to-pink-50 rounded-2xl p-6 border-2 border-red-300 shadow-lg">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="relative">
                              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
                              <div className="absolute inset-0 w-4 h-4 bg-red-500 rounded-full animate-ping" />
                            </div>
                            <span className="text-sm font-bold text-red-700 uppercase tracking-wide">
                              KAYIT YAPILIYOR
                            </span>
                          </div>
                          <div className="bg-white/80 rounded-xl p-4 min-h-[60px]">
                            <p className="text-lg font-medium text-gray-900 leading-relaxed">
                              {userTranscript || 'Konuşmanız işleniyor...'}
                            </p>
                          </div>
                          <div className="mt-4 flex gap-3">
                            <Button onClick={finishCurrentAnswer} className="bg-brand-primary text-white hover:bg-brand-primary-hover" size="lg">
                              Yanıtı Bitir
                            </Button>
                            <Button onClick={skipQuestion} variant="outline" size="lg">
                              <SkipForward className="h-4 w-4 mr-2" />
                              Atla
                            </Button>
                          </div>
                        </div>
                      ) : isReviewingTranscript ? (
                        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl p-6 border-2 border-yellow-400 shadow-lg">
                          <div className="flex items-center justify-between mb-3 gap-4">
                            <span className="text-sm font-bold text-yellow-800 uppercase tracking-wide">
                              Yanıtı kontrol edin
                            </span>
                            <span className="text-xs text-yellow-700">
                              Devam etmeden once yanitinizi duzenleyebilir veya dogrudan kaydedebilirsiniz.
                            </span>
                          </div>
                          <Textarea
                            value={editableTranscript}
                            onChange={(event) => setEditableTranscript(event.target.value)}
                            className="w-full min-h-[100px] text-lg font-medium leading-relaxed resize-none"
                            placeholder="Yanıtınızı buraya yazın..."
                          />
                          <div className="flex flex-wrap gap-3 mt-4">
                            <Button onClick={() => void confirmAndSaveResponse()} className="bg-green-600 hover:bg-green-700 text-white" size="lg">
                              Onayla ve Kaydet
                            </Button>
                            <Button onClick={() => void reRecordAnswer()} variant="outline" size="lg">
                              Tekrar Kaydet
                            </Button>
                            <Button onClick={() => void skipQuestion()} variant="outline" size="lg">
                              <SkipForward className="h-4 w-4 mr-2" />
                              Atla
                            </Button>
                          </div>
                        </div>
                      ) : isWaitingForAnswer ? (
                        <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-2xl p-6 border-2 border-dashed border-gray-300">
                          <div className="flex flex-col items-center justify-center gap-3 min-h-[80px]">
                            <Mic className="h-8 w-8 text-gray-400 animate-pulse" />
                            <p className="text-base text-gray-600 font-medium text-center">
                              {responseRecoveryMessage ?? 'Lütfen yanıtınızı sesli olarak verin...'}
                            </p>
                            {draftTranscript ? (
                              <div className="w-full max-w-2xl rounded-xl bg-white/80 p-4 text-left shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  Şu ana kadar kaydedilen kısım
                                </p>
                                <p className="mt-2 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                                  {draftTranscript}
                                </p>
                              </div>
                            ) : null}
                            <div className="flex flex-wrap items-center justify-center gap-3">
                              {isListening || isTranscribing ? (
                                <Button onClick={finishCurrentAnswer} size="lg" className="bg-brand-primary text-white hover:bg-brand-primary-hover">
                                  Yanıtı Bitir
                                </Button>
                              ) : null}
                              {needsRetryRecording ? (
                                <Button onClick={() => void startListening({ resetDuration: false, preserveDraft: true })} size="lg" variant="outline">
                                  {resumeAfterFailure ? 'Kaldığın Yerden Devam Et' : 'Tekrar Kaydet'}
                                </Button>
                              ) : null}
                              <Button onClick={() => void skipQuestion()} variant="outline" size="lg">
                                <SkipForward className="h-4 w-4 mr-2" />
                                Atla
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : interviewProgress.isComplete ? (
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
                      Oturum basariyla tamamlandi
                    </div>
                    <div>
                      <h3 className="text-2xl font-semibold text-foreground">Görüşme tamamlandı</h3>
                      <p className="mt-3 text-muted-foreground">
                        Katılımınız için teşekkürler. İsterseniz şimdi oturumu kapatabilirsiniz.
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

          <div className="border-t border-border bg-card/50 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button
                  onClick={toggleMicrophone}
                  variant={isListening || isTranscribing ? 'default' : 'outline'}
                  size="lg"
                  className={`gap-2 ${isListening || isTranscribing ? 'ring-2 ring-green-500 ring-offset-2' : ''}`}
                  disabled={isReviewingTranscript || isSubmittingResponse || !currentQuestion}
                >
                  {isListening || isTranscribing ? (
                    <>
                      <Mic className="h-5 w-5" />
                      <span className="hidden sm:inline">Yanıtı Bitir</span>
                    </>
                  ) : (
                    <>
                      <MicOff className="h-5 w-5" />
                      <span className="hidden sm:inline">Mikrofon</span>
                    </>
                  )}
                </Button>
                {isRecordingVideo ? (
                  <span className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Video kaydı alınıyor
                  </span>
                ) : null}
              </div>

              <div className="text-sm text-muted-foreground font-mono">
                {getSessionDuration()}
              </div>

              <Button
                onClick={() => {
                  if (interviewProgress.isComplete) {
                    onSessionEnd?.('completed');
                    return;
                  }

                  setShowEndSessionConfirmation(true);
                }}
                variant="destructive"
                size="lg"
                className="gap-2"
              >
                <PhoneOff className="h-5 w-5" />
                {interviewProgress.isComplete ? 'Oturumu Tamamla' : 'Oturumu Bitir'}
              </Button>
            </div>
          </div>

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
            <div className="bg-slate-900 text-white p-4 text-xs font-mono">
              <div>Listening: {isListening ? '✅' : '❌'}</div>
              <div>Transcribing: {isTranscribing ? '✅' : '❌'}</div>
              <div>Submitting: {isSubmittingResponse ? '✅' : '❌'}</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default SearchoAI;
