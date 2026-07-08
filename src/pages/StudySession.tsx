import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import SearchoAI from "@/components/SearchoAI";
import { FloatingVideo } from "@/components/FloatingVideo";
import { supabase } from "@/integrations/supabase/client";
import { participantService } from "@/services/participantService";
import { interviewService, InterviewProgress, InterviewQuestion, setInterviewSessionToken } from "@/services/interviewService";
import { CheckCircle, AlertCircle, Clock, Loader2, ExternalLink, Image as ImageIcon, Camera, Mic, MonitorUp } from "lucide-react";
import {
  DeviceCheckState,
  MicFailureCode,
  getMicrophoneFailureMessage,
  mapMediaAccessErrorToFailureCode,
  probeMicrophoneHealth,
} from "@/utils/microphoneHealth";

type CameraValidationResult = {
  verified: boolean;
  preview: boolean;
  message: string | null;
};

const svgToDataUrl = (svg: string) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const createMockScreen = (accent: string, title: string, subtitle: string, cta: string) =>
  svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280" fill="none">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accent}"/>
          <stop offset="100%" stop-color="#F6F1FF"/>
        </linearGradient>
      </defs>
      <rect width="720" height="1280" rx="56" fill="url(#bg)"/>
      <rect x="56" y="58" width="608" height="72" rx="36" fill="rgba(255,255,255,0.72)"/>
      <rect x="84" y="84" width="182" height="20" rx="10" fill="rgba(43,17,98,0.18)"/>
      <rect x="560" y="84" width="76" height="20" rx="10" fill="rgba(43,17,98,0.10)"/>
      <rect x="84" y="182" width="552" height="344" rx="40" fill="rgba(255,255,255,0.88)"/>
      <rect x="116" y="222" width="214" height="24" rx="12" fill="rgba(43,17,98,0.14)"/>
      <rect x="116" y="274" width="420" height="110" rx="26" fill="#FFFFFF"/>
      <rect x="116" y="412" width="224" height="72" rx="36" fill="${accent}"/>
      <text x="360" y="646" text-anchor="middle" font-family="Noto Sans, Arial, sans-serif" font-size="58" font-weight="700" fill="#1F1635">${title}</text>
      <text x="360" y="720" text-anchor="middle" font-family="Noto Sans, Arial, sans-serif" font-size="31" fill="#4E4662">${subtitle}</text>
      <rect x="88" y="830" width="544" height="124" rx="38" fill="rgba(255,255,255,0.94)"/>
      <text x="360" y="907" text-anchor="middle" font-family="Noto Sans, Arial, sans-serif" font-size="36" font-weight="700" fill="#2F1B55">${cta}</text>
      <rect x="88" y="986" width="544" height="92" rx="34" fill="rgba(46,20,96,0.08)" stroke="rgba(46,20,96,0.18)" stroke-width="4"/>
      <text x="360" y="1044" text-anchor="middle" font-family="Noto Sans, Arial, sans-serif" font-size="31" fill="#5B4C7E">Daha sonra bakacağım</text>
      <rect x="248" y="1154" width="224" height="10" rx="5" fill="rgba(31,22,53,0.18)"/>
    </svg>
  `);

// Mock data for design mode
const MOCK_PROJECT_DATA = {
  id: 'mock-project-id',
  title: 'Pop-up Ekranı İlk Görünüş ve Algılama Testi',
  description: 'Bu bir örnek usability araştırması. Katılımcının kopyalanıp yapıştırılmış Figma ekranını ilk görünüşte nasıl yorumladığını anlamak için tasarlandı.',
  analysis: {
    designScreens: [
      {
        name: 'Promosyon Pop-up',
        url: createMockScreen('#6E3BFF', 'Ramazan Hediyesi', 'İlk bakışta anlaşılır mı?', 'Hemen Katıl'),
        source: 'upload'
      },
      {
        name: 'Kayıt Alt Ekranı',
        url: createMockScreen('#4D8DFF', 'Dakikalar İçinde Kayıt', 'Form alanları net mi?', 'Kaydı Başlat'),
        source: 'upload'
      }
    ],
    discussionGuide: {
      sections: [
        {
          title: 'Giriş ve Isınma',
          questions: [
            'Bu ekranı ilk gördüğünüzde size ne anlatıyor?',
            'Burada ilk olarak ne yapmanız beklendiğini nasıl anladınız?'
          ]
        },
        {
          title: 'Ana Sorular',
          questions: [
            'Bu pop-up size güven veriyor mu, neden?',
            'Dikkatinizi dağıtan veya kararsız bırakan alanlar var mı?'
          ]
        }
      ]
    }
  }
};

type DesignScreen = {
  name?: string;
  url: string;
  source?: string;
  interactionMode?: string;
  embedUrl?: string;
};

type StudyProjectData = {
  id?: string;
  description?: string;
  analysis?: {
    designScreens?: DesignScreen[];
    discussionGuide?: unknown;
    researchMode?: string;
    aiEnhancedBrief?: unknown;
    usabilityTesting?: unknown;
  };
};

type ParticipantSummary = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

type SessionMetadata = Record<string, unknown> & {
  deviceCheck?: Record<string, unknown>;
};

type ScreenRecordingState =
  | 'not_required'
  | 'pending'
  | 'requesting'
  | 'recording'
  | 'interrupted'
  | 'uploading'
  | 'uploaded'
  | 'failed';

const StudySession = () => {
  const { sessionToken } = useParams();
  
  // Check if we're in design mode (placeholder tokens or special keywords)
  const isDesignMode = !sessionToken || 
    sessionToken.includes(':') || 
    ['mock', 'design', 'preview', 'test'].includes(sessionToken.toLowerCase());
  
  const [loading, setLoading] = useState(!isDesignMode);
  const [error, setError] = useState<string | null>(null);
  const [pausedMessage, setPausedMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(isDesignMode ? 'mock-session-id' : null);
  const [participantId, setParticipantId] = useState<string | null>(isDesignMode ? 'mock-participant-id' : null);
  const [participantName, setParticipantName] = useState<string | null>(isDesignMode ? 'Örnek Katılımcı' : null);
  const [projectData, setProjectData] = useState<StudyProjectData | null>(isDesignMode ? MOCK_PROJECT_DATA : null);
  const [sessionStatus, setSessionStatus] = useState<'waiting' | 'active' | 'completed'>(isDesignMode ? 'active' : 'waiting');
  const [activeScreenIndex, setActiveScreenIndex] = useState(0);
  const [currentInterviewQuestion, setCurrentInterviewQuestion] = useState<InterviewQuestion | null>(null);
  const [currentInterviewProgress, setCurrentInterviewProgress] = useState<InterviewProgress>({
    completed: 0,
    total: 0,
    isComplete: false,
    percentage: 0
  });
  const [sessionCompletionReason, setSessionCompletionReason] = useState<'manual' | 'completed' | null>(null);
  const [isOnboardingActive, setIsOnboardingActive] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState(false);
  const [cameraGateCompleted, setCameraGateCompleted] = useState(false);
  const [screenRecordingState, setScreenRecordingState] = useState<ScreenRecordingState>('not_required');
  const [screenRecordingMessage, setScreenRecordingMessage] = useState<string | null>(null);
  const [cameraPreviewReady, setCameraPreviewReady] = useState(false);
  const [cameraStreamVerified, setCameraStreamVerified] = useState(false);
  const [microphoneVerified, setMicrophoneVerified] = useState(false);
  const [deviceCheckState, setDeviceCheckState] = useState<DeviceCheckState>('idle');
  const [deviceCheckFailureCode, setDeviceCheckFailureCode] = useState<MicFailureCode | null>(null);
  const [deviceCheckMessage, setDeviceCheckMessage] = useState<string | null>(null);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [microphoneLevelThreshold, setMicrophoneLevelThreshold] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraGateVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenRecordingChunksRef = useRef<Blob[]>([]);
  const screenRecordingStartedAtRef = useRef(0);
  const screenRecordingFinalizingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(sessionId);
  const sessionMetadataRef = useRef<SessionMetadata | null>(null);
  const deviceCheckRetryCountRef = useRef(0);
  const hasShownCameraFailureRef = useRef(false);

  const stopCameraStream = (stream: MediaStream | null) => {
    stream?.getTracks().forEach(track => track.stop());
  };

  const getScreenRecordingMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return 'video/webm';
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? 'video/webm';
  };

  const stopScreenStream = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
  }, []);

  const stopScreenRecording = useCallback(async (discard = false) => {
    const recorder = screenRecorderRef.current;
    const startedAt = screenRecordingStartedAtRef.current;

    if (!recorder || recorder.state === 'inactive') {
      const blob = !discard && screenRecordingChunksRef.current.length > 0
        ? new Blob(screenRecordingChunksRef.current, { type: getScreenRecordingMimeType() })
        : null;
      screenRecorderRef.current = null;
      screenRecordingStartedAtRef.current = 0;
      return {
        blob,
        durationMs: startedAt ? Math.max(0, performance.now() - startedAt) : 0,
      };
    }

    return await new Promise<{ blob: Blob | null; durationMs: number }>((resolve) => {
      let settled = false;
      const finalize = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        const durationMs = startedAt ? Math.max(0, performance.now() - startedAt) : 0;
        screenRecorderRef.current = null;
        screenRecordingStartedAtRef.current = 0;
        resolve({ blob, durationMs });
      };

      recorder.onstop = () => {
        const blob = !discard && screenRecordingChunksRef.current.length > 0
          ? new Blob(screenRecordingChunksRef.current, { type: recorder.mimeType || 'video/webm' })
          : null;
        finalize(blob);
      };
      recorder.onerror = () => finalize(null);

      try {
        recorder.stop();
      } catch (error) {
        console.error('Failed to stop screen recorder:', error);
        finalize(null);
      }
    });
  }, []);

  const persistDeviceCheckSnapshot = useCallback(async (
    nextState: DeviceCheckState,
    failureCode: MicFailureCode | null,
    message: string | null,
  ) => {
    const activeSessionId = sessionIdRef.current;
    if (isDesignMode || !activeSessionId) {
      return;
    }

    const currentMetadata: SessionMetadata = sessionMetadataRef.current && typeof sessionMetadataRef.current === 'object'
      ? sessionMetadataRef.current
      : {};
    const previousDeviceCheck: Record<string, unknown> = currentMetadata.deviceCheck && typeof currentMetadata.deviceCheck === 'object'
      ? currentMetadata.deviceCheck
      : {};
    const checkedAt = new Date().toISOString();
    const readyAt = nextState === 'ready'
      ? checkedAt
      : (previousDeviceCheck.readyAt as string | null | undefined) ?? null;
    const nextMetadata = {
      ...currentMetadata,
      deviceCheck: {
        ...previousDeviceCheck,
        lastState: nextState,
        lastFailureCode: failureCode,
        lastFailureMessage: message,
        retryCount: deviceCheckRetryCountRef.current,
        lastCheckedAt: checkedAt,
        readyAt,
      },
    };

    sessionMetadataRef.current = nextMetadata;

    try {
      await participantService.updateSession(activeSessionId, { metadata: nextMetadata });
    } catch (persistError) {
      console.warn('Failed to persist device check snapshot:', persistError);
    }
  }, [isDesignMode]);

  const resetCameraState = (message: string | null = null, failureCode: MicFailureCode | null = null) => {
    setCameraEnabled(false);
    setCameraPreviewReady(false);
    setCameraStreamVerified(false);
    setMicrophoneVerified(false);
    setCameraGateCompleted(false);
    setDeviceCheckState(message ? 'failed' : 'idle');
    setDeviceCheckFailureCode(failureCode);
    setDeviceCheckMessage(message);
    setMicrophoneLevel(0);
    setMicrophoneLevelThreshold(0);
  };

  const releaseMediaDevices = ({
    preserveGate = false,
    message = null,
    failureCode = null,
  }: {
    preserveGate?: boolean;
    message?: string | null;
    failureCode?: MicFailureCode | null;
  } = {}) => {
    stopCameraStream(cameraStreamRef.current);
    cameraStreamRef.current = null;

    setCameraStream(null);
    setCameraEnabled(false);
    setCameraPreviewReady(false);
    setCameraStreamVerified(false);
    setMicrophoneVerified(false);
    setMicrophoneLevel(0);
    setMicrophoneLevelThreshold(0);
    if (!preserveGate) {
      setCameraGateCompleted(false);
    }
    setDeviceCheckState(message ? 'failed' : 'idle');
    setDeviceCheckFailureCode(failureCode);
    setDeviceCheckMessage(message);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (cameraGateVideoRef.current) {
      cameraGateVideoRef.current.srcObject = null;
    }
  };

  const isLiveVideoTrack = (track?: MediaStreamTrack | null) =>
    Boolean(track && track.readyState === 'live' && track.enabled !== false);

  const isLiveAudioTrack = (track?: MediaStreamTrack | null) =>
    Boolean(track && track.readyState === 'live' && track.enabled !== false);

  const waitForVideoMetadata = async (video: HTMLVideoElement, timeoutMs = 2000) =>
    new Promise<boolean>((resolve) => {
      if (
        video.readyState >= HTMLMediaElement.HAVE_METADATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        resolve(true);
        return;
      }

      let settled = false;
      let intervalId: number | null = null;
      let timeoutId: number | null = null;

      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        if (intervalId !== null) window.clearInterval(intervalId);
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        resolve(result);
      };

      intervalId = window.setInterval(() => {
        if (
          video.readyState >= HTMLMediaElement.HAVE_METADATA &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          finish(true);
        }
      }, 120);

      timeoutId = window.setTimeout(() => finish(false), timeoutMs);
    });

  const waitForRenderedPreview = async (video: HTMLVideoElement, timeoutMs = 2200) =>
    new Promise<boolean>((resolve) => {
      const canUseVideoFrameCallback = typeof (video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number;
      }).requestVideoFrameCallback === 'function';

      let settled = false;
      let intervalId: number | null = null;
      let timeoutId: number | null = null;
      let frameCount = 0;

      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        if (intervalId !== null) window.clearInterval(intervalId);
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        resolve(result);
      };

      const hasRenderableFrame = () =>
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !video.paused &&
        !video.ended;

      timeoutId = window.setTimeout(() => finish(false), timeoutMs);

      if (canUseVideoFrameCallback) {
        const frameVideo = video as HTMLVideoElement & {
          requestVideoFrameCallback: (callback: () => void) => number;
        };

        const tick = () => {
          frameVideo.requestVideoFrameCallback(() => {
            if (settled) return;

            if (hasRenderableFrame()) {
              frameCount += 1;
              if (frameCount >= 2) {
                finish(true);
                return;
              }
            }

            tick();
          });
        };

        tick();
        return;
      }

      intervalId = window.setInterval(() => {
        if (hasRenderableFrame()) {
          finish(true);
        }
      }, 120);
    });

  const verifyTrackWithImageCapture = async (track: MediaStreamTrack) => {
    const ImageCaptureCtor = (window as Window & {
      ImageCapture?: new (mediaStreamTrack: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> };
    }).ImageCapture;

    if (!ImageCaptureCtor) return false;

    try {
      const capture = new ImageCaptureCtor(track);
      const bitmap = await capture.grabFrame();
      const isValid = bitmap.width > 0 && bitmap.height > 0;
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }
      return isValid;
    } catch (error) {
      console.warn('ImageCapture validation failed:', error);
      return false;
    }
  };

  const verifyTrackWithRecorder = async (stream: MediaStream, timeoutMs = 2600) => {
    if (typeof MediaRecorder === 'undefined') return false;

    const preferredMimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];

    const supportedMimeType = preferredMimeTypes.find((candidate) =>
      typeof MediaRecorder.isTypeSupported === 'function'
        ? MediaRecorder.isTypeSupported(candidate)
        : candidate === 'video/webm'
    );

    try {
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      return await new Promise<boolean>((resolve) => {
        let recordedBytes = 0;
        let settled = false;

        const finish = (result: boolean) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        const timeoutId = window.setTimeout(() => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
          finish(false);
        }, timeoutMs);

        recorder.ondataavailable = (event) => {
          recordedBytes += event.data?.size || 0;
        };

        recorder.onerror = () => {
          window.clearTimeout(timeoutId);
          finish(false);
        };

        recorder.onstop = () => {
          window.clearTimeout(timeoutId);
          finish(recordedBytes > 0);
        };

        recorder.start(250);

        window.setTimeout(() => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, 900);
      });
    } catch (error) {
      console.warn('MediaRecorder validation failed:', error);
      return false;
    }
  };

  const validateCameraStream = async (stream: MediaStream): Promise<CameraValidationResult> => {
    const videoTrack = stream.getVideoTracks()[0];
    if (!isLiveVideoTrack(videoTrack)) {
      return {
        verified: false,
        preview: false,
        message: 'Kamera akışı başlatılamadı. Lütfen tekrar deneyin.',
      };
    }

    const previewElement = cameraGateVideoRef.current;

    if (previewElement) {
      previewElement.srcObject = stream;

      try {
        await previewElement.play();
      } catch (error) {
        console.warn('Preview playback could not start immediately:', error);
      }

      const hasMetadata = await waitForVideoMetadata(previewElement);
      if (hasMetadata) {
        setCameraPreviewReady(true);
        const hasRenderedPreview = await waitForRenderedPreview(previewElement);
        if (hasRenderedPreview) {
          return {
            verified: true,
            preview: true,
            message: null,
          };
        }
      }
    }

    if (await verifyTrackWithImageCapture(videoTrack)) {
      return {
        verified: true,
        preview: false,
        message: 'Tarayıcınız canlı önizlemeyi göstermese de kameranız aktif olarak doğrulandı. Devam edebilirsiniz.',
      };
    }

    if (await verifyTrackWithRecorder(stream)) {
      return {
        verified: true,
        preview: false,
        message: 'Tarayıcınız canlı önizlemeyi göstermese de kameranız aktif olarak doğrulandı. Devam edebilirsiniz.',
      };
    }

    return {
      verified: false,
      preview: false,
      message: 'Canlı kamera görüntüsü doğrulanamadı. Kamerayı yeniden deneyin.',
    };
  };

  useEffect(() => {
    // Skip initialization in design mode
    if (isDesignMode) {
      setInterviewSessionToken(null);
      console.log('Design mode active - using mock data');
      setLoading(false);
      return;
    }
    
    if (sessionToken) {
      setInterviewSessionToken(sessionToken);
      initializeSession();
    } else {
      setInterviewSessionToken(null);
      setError("Geçersiz oturum");
      setLoading(false);
    }

    return () => {
      setInterviewSessionToken(null);
      stopCameraStream(cameraStreamRef.current);
    };
  }, [sessionToken]);

  useEffect(() => {
    cameraStreamRef.current = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      void videoRef.current.play().catch(console.error);
    }

    if (cameraGateVideoRef.current) {
      cameraGateVideoRef.current.srcObject = cameraStream;
      void cameraGateVideoRef.current.play().catch(console.error);
    }
  }, [cameraStream]);

  useEffect(() => {
    if (!cameraStream || !cameraGateCompleted) return;

    const previewElement = videoRef.current;
    if (!previewElement) return;

    let intervalId: number | null = null;

    const syncPreviewHealth = async () => {
      if (!previewElement.srcObject) {
        previewElement.srcObject = cameraStream;
      }

      try {
        await previewElement.play();
      } catch (error) {
        console.warn('Floating preview playback could not start immediately:', error);
      }

      intervalId = window.setInterval(() => {
        const hasRenderableFrame =
          previewElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          previewElement.videoWidth > 0 &&
          previewElement.videoHeight > 0 &&
          !previewElement.paused &&
          !previewElement.ended;

        setCameraPreviewReady(hasRenderableFrame);
      }, 800);
    };

    void syncPreviewHealth();

    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [cameraStream, cameraGateCompleted]);

  useEffect(() => {
    if (!cameraStream) return;

    const videoTrack = cameraStream.getVideoTracks()[0];
    const audioTrack = cameraStream.getAudioTracks()[0];
    if (!videoTrack && !audioTrack) return;

    let disconnected = false;

    const handleTrackInterrupted = (failureCode: MicFailureCode, message: string, toastMessage: string) => {
      if (disconnected) return;
      disconnected = true;

      stopCameraStream(cameraStream);
      setCameraStream(null);
      resetCameraState(message, failureCode);
      void persistDeviceCheckSnapshot('failed', failureCode, message);
      if (!hasShownCameraFailureRef.current) {
        toast.error(toastMessage);
        hasShownCameraFailureRef.current = true;
      }
    };

    const handleVideoInterrupted = () => {
      handleTrackInterrupted(
        'track_ended',
        'Kamera bağlantısı kesildi. Devam etmeden önce yeniden bağlanın.',
        'Kamera bağlantısı kesildi. Oturum devam etmeden önce kamerayı yeniden açın.',
      );
    };
    const handleAudioInterrupted = () => {
      handleTrackInterrupted(
        'track_ended',
        'Mikrofon bağlantısı kesildi. Devam etmeden önce yeniden bağlanın.',
        'Mikrofon bağlantısı kesildi. Oturum devam etmeden önce mikrofonu yeniden açın.',
      );
    };

    videoTrack?.addEventListener('ended', handleVideoInterrupted);
    audioTrack?.addEventListener('ended', handleAudioInterrupted);
    const healthInterval = window.setInterval(() => {
      if (videoTrack && !isLiveVideoTrack(videoTrack)) {
        handleVideoInterrupted();
        return;
      }

      if (audioTrack && !isLiveAudioTrack(audioTrack)) {
        handleAudioInterrupted();
      }
    }, 1200);

    return () => {
      videoTrack?.removeEventListener('ended', handleVideoInterrupted);
      audioTrack?.removeEventListener('ended', handleAudioInterrupted);
      window.clearInterval(healthInterval);
    };
  }, [cameraStream, persistDeviceCheckSnapshot]);

  const initializeSession = async () => {
    try {
      setLoading(true);
      setError(null);
      setPausedMessage(null);

      const access = await participantService.getSessionAccessByToken(sessionToken!);

      if (!access) {
        setError("Oturum bilgileri yüklenemedi");
        return;
      }

      if (access.access_state === 'paused') {
        setPausedMessage(access.message || "Araştırma geçici olarak duraklatıldı. Lütfen daha sonra tekrar deneyin.");
        return;
      }

      if (access.access_state !== 'active' || !access.session_data || !access.project_data) {
        setError(access.message || "Oturum bulunamadı veya süresi doldu");
        return;
      }

      const cachedParticipantSession = localStorage.getItem('participant-session');
      let cachedParticipant: ParticipantSummary | null = null;

      if (cachedParticipantSession && sessionToken) {
        try {
          const parsed = JSON.parse(cachedParticipantSession);
          if (parsed?.token === sessionToken) {
            cachedParticipant = parsed.participant ?? null;
          }
        } catch (cacheError) {
          console.warn('Failed to parse cached participant session:', cacheError);
        }
      }

      const session = access.session_data;
      const participant = access.participant_data || cachedParticipant;

      console.log('Session access resolved:', access);
      sessionIdRef.current = session.id || null;
      sessionMetadataRef.current = session.metadata && typeof session.metadata === 'object'
        ? session.metadata as SessionMetadata
        : {};
      setSessionId(session.id || null);
      setParticipantId(session.participant_id || participant?.id || null);
      setParticipantName(participant?.name || participant?.email || 'Katılımcı');
      setProjectData(access.project_data);
      setSessionStatus(session.status === 'completed' ? 'completed' : 'active');
      setSessionCompletionReason(session.status === 'completed' ? 'completed' : null);

      await syncDevicePermissions();
    } catch (error) {
      console.error('Failed to initialize session:', error);
      setError("Oturum başlatılırken hata oluştu");
      toast.error("Oturum başlatılırken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const applyDeviceCheckFailure = useCallback(async (failureCode: MicFailureCode, message?: string | null) => {
    const nextMessage = message ?? getMicrophoneFailureMessage(failureCode);

    releaseMediaDevices({
      preserveGate: false,
      message: nextMessage,
      failureCode,
    });
    await persistDeviceCheckSnapshot('failed', failureCode, nextMessage);
    return nextMessage;
  }, [persistDeviceCheckSnapshot]);

  const syncDevicePermissions = async () => {
    try {
      if (!('permissions' in navigator) || !navigator.permissions?.query) {
        return;
      }

      const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
      const granted = permissionStatus.state === 'granted';
      setHasCameraPermission(granted);

      permissionStatus.onchange = () => {
        const isGranted = permissionStatus.state === 'granted';
        setHasCameraPermission(isGranted);
        if (!isGranted) {
          void applyDeviceCheckFailure(
            'permission_denied',
            'Tarayıcı kamera iznini kapattı. Devam etmek için kamera ve mikrofon iznini yeniden açın.',
          );
        }
      };

      try {
        const microphonePermissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        const microphoneGranted = microphonePermissionStatus.state === 'granted';
        setHasMicrophonePermission(microphoneGranted);

        microphonePermissionStatus.onchange = () => {
          const isGranted = microphonePermissionStatus.state === 'granted';
          setHasMicrophonePermission(isGranted);
          if (!isGranted) {
            void applyDeviceCheckFailure(
              'permission_denied',
              'Tarayıcı mikrofon iznini kapattı. Devam etmek için kamera ve mikrofon iznini yeniden açın.',
            );
          }
        };
        return;
      } catch (error) {
        console.warn('Microphone permissions API not available:', error);
      }
    } catch (error) {
      console.error('Error checking camera permissions:', error);
    }
  };

  const runDeviceCheck = async () => {
    setDeviceCheckState('requesting_permission');
    setDeviceCheckFailureCode(null);
    setDeviceCheckMessage(null);
    setMicrophoneLevel(0);
    setMicrophoneLevelThreshold(0);
    hasShownCameraFailureRef.current = false;
    deviceCheckRetryCountRef.current += 1;
    await persistDeviceCheckSnapshot('requesting_permission', null, null);

    try {
      if (!window.isSecureContext) {
        const message = await applyDeviceCheckFailure('insecure_context');
        toast.error(message);
        return false;
      }

      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        const message = await applyDeviceCheckFailure('browser_unsupported');
        toast.error(message);
        return false;
      }

      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const fallbackCamera = devices.find((device) => device.kind === 'videoinput');
      const constraintsQueue: MediaStreamConstraints[] = [
        {
          video: {
            width: { ideal: 960 },
            height: { ideal: 720 },
            facingMode: { ideal: "user" },
          },
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        },
        {
          video: {
            width: { ideal: 960 },
            height: { ideal: 720 },
          },
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        },
      ];

      if (fallbackCamera?.deviceId) {
        constraintsQueue.push({
          video: {
            deviceId: { exact: fallbackCamera.deviceId },
          },
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }

      constraintsQueue.push({
        video: true,
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      let stream: MediaStream | null = null;
      let lastError: unknown = null;

      for (const constraints of constraintsQueue) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!stream) {
        throw lastError;
      }

      const audioTrack = stream.getAudioTracks()[0];
      if (!isLiveAudioTrack(audioTrack)) {
        stopCameraStream(stream);
        setHasMicrophonePermission(false);
        const message = await applyDeviceCheckFailure('track_ended');
        toast.error(message);
        return false;
      }

      stopCameraStream(cameraStreamRef.current);
      setCameraStream(stream);
      setCameraEnabled(true);
      setHasCameraPermission(true);
      setHasMicrophonePermission(true);
      setMicrophoneVerified(false);
      setCameraPreviewReady(false);
      setCameraStreamVerified(false);
      setDeviceCheckState('verifying_camera');
      setDeviceCheckMessage('Kamera görüntüsü doğrulanıyor...');

      const validation = await validateCameraStream(stream);

      if (!validation.verified) {
        stopCameraStream(stream);
        const message = await applyDeviceCheckFailure('device_busy', validation.message || 'Canlı kamera görüntüsü doğrulanamadı. Kamerayı yeniden deneyin.');
        toast.error(message);
        return false;
      }

      setCameraStreamVerified(true);
      setCameraPreviewReady(validation.preview);
      setDeviceCheckState('verifying_microphone');
      setDeviceCheckFailureCode(null);
      setDeviceCheckMessage('Lütfen kısa bir cümle söyleyin. Mikrofon sinyalini test ediyoruz.');

      const microphoneHealth = await probeMicrophoneHealth(stream, {
        onLevelSample: ({ level, threshold }) => {
          setMicrophoneLevel(level);
          setMicrophoneLevelThreshold(threshold);
        },
      });

      if (!microphoneHealth.ok) {
        stopCameraStream(stream);
        const message = await applyDeviceCheckFailure(
          microphoneHealth.failureCode ?? 'track_silent',
          microphoneHealth.message,
        );
        toast.error(message);
        return false;
      }

      setMicrophoneVerified(true);
      setDeviceCheckState('ready');
      setDeviceCheckFailureCode(null);
      setDeviceCheckMessage(validation.message ?? 'Kamera ve mikrofon hazır. Araştırmaya devam edebilirsiniz.');
      await persistDeviceCheckSnapshot('ready', null, validation.message ?? 'Kamera ve mikrofon hazır.');
      return true;
    } catch (error) {
      console.error('Error accessing camera:', error);
      const failureCode = mapMediaAccessErrorToFailureCode(error);
      const message = await applyDeviceCheckFailure(failureCode);
      setHasCameraPermission(failureCode === 'permission_denied' ? false : hasCameraPermission);
      setHasMicrophonePermission(failureCode === 'permission_denied' ? false : hasMicrophonePermission);
      toast.error(message);
      return false;
    }
  };

  const handleMediaRecoveryRequested = useCallback((reason: MicFailureCode) => {
    const message = getMicrophoneFailureMessage(reason);
    void applyDeviceCheckFailure(reason, message);
  }, [applyDeviceCheckFailure]);

  const startScreenRecording = useCallback(async () => {
    if (isDesignMode) {
      setScreenRecordingState('recording');
      setScreenRecordingMessage('Tasarım modunda ekran kaydı simüle ediliyor.');
      return true;
    }

    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      setScreenRecordingState('failed');
      setScreenRecordingMessage('Tarayıcınız ekran kaydını desteklemiyor. Lütfen Chrome veya Edge ile tekrar deneyin.');
      toast.error('Ekran kaydı desteklenmiyor.');
      return false;
    }

    setScreenRecordingState('requesting');
    setScreenRecordingMessage('Tarayıcı penceresinden Figma prototipinin olduğu sekme veya pencereyi seçin.');

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('No screen video track returned');
      }

      screenStreamRef.current = stream;
      screenRecordingChunksRef.current = [];
      const mimeType = getScreenRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          screenRecordingChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setScreenRecordingState('failed');
        setScreenRecordingMessage('Ekran kaydı sırasında hata oluştu. Ekran paylaşımını tekrar başlatın.');
      };
      videoTrack.onended = () => {
        if (screenRecordingFinalizingRef.current) return;
        setScreenRecordingState('interrupted');
        setScreenRecordingMessage('Ekran paylaşımı durdu. Kullanılabilirlik testine devam etmek için tekrar başlatın.');
        void stopScreenRecording(false);
      };

      screenRecorderRef.current = recorder;
      screenRecordingStartedAtRef.current = performance.now();
      recorder.start(1000);
      setScreenRecordingState('recording');
      setScreenRecordingMessage('Ekran kaydı aktif. Prototip ile etkileşime devam edebilirsiniz.');
      toast.success('Ekran kaydı başladı.');
      return true;
    } catch (error) {
      console.error('Failed to start screen recording:', error);
      stopScreenStream();
      setScreenRecordingState('pending');
      setScreenRecordingMessage('Ekran paylaşımı başlatılmadan kullanılabilirlik testine devam edemezsiniz.');
      toast.error('Ekran paylaşımı gerekli.');
      return false;
    }
  }, [isDesignMode, stopScreenRecording, stopScreenStream]);

  const uploadScreenRecording = useCallback(async () => {
    if (isDesignMode || !sessionIdRef.current) {
      return;
    }

    screenRecordingFinalizingRef.current = true;
    try {
      const { blob, durationMs } = await stopScreenRecording(false);
      stopScreenStream();

      if (!blob || blob.size === 0) {
        setScreenRecordingState('failed');
        setScreenRecordingMessage('Ekran kaydı yüklenemedi çünkü kayıt verisi boş görünüyor.');
        return;
      }

      setScreenRecordingState('uploading');
      setScreenRecordingMessage('Ekran kaydı güvenli alana yükleniyor.');

      const uploadTarget = await interviewService.prepareScreenRecordingUpload(sessionIdRef.current, {
        mimeType: blob.type || 'video/webm',
      });

      const { error: uploadError } = await supabase.storage
        .from(uploadTarget.bucket)
        .uploadToSignedUrl(uploadTarget.path, uploadTarget.token, blob, {
          contentType: blob.type || uploadTarget.mimeType || 'video/webm',
        });

      if (uploadError) {
        throw new Error(`Screen recording upload failed: ${uploadError.message}`);
      }

      await interviewService.finalizeScreenRecording(sessionIdRef.current, {
        path: uploadTarget.path,
        mimeType: blob.type || uploadTarget.mimeType || 'video/webm',
        durationMs,
        sizeBytes: blob.size,
        metadata: {
          capturedSurface: 'participant_selected_display',
          audioCaptured: false,
          privacyNotice: 'screen_recording_may_include_sensitive_prototype_content',
        },
      });

      setScreenRecordingState('uploaded');
      setScreenRecordingMessage('Ekran kaydı güvenli şekilde yüklendi.');
    } catch (error) {
      console.error('Failed to upload screen recording:', error);
      setScreenRecordingState('failed');
      setScreenRecordingMessage('Ekran kaydı yüklenemedi. Lütfen oturumu tamamlamadan önce tekrar deneyin.');
      throw error;
    } finally {
      screenRecordingFinalizingRef.current = false;
    }
  }, [isDesignMode, stopScreenRecording, stopScreenStream]);

  const handleCompleteSession = async (reason: 'manual' | 'completed' = 'manual') => {
    if (reason === 'completed' && screenRecordingState === 'recording') {
      try {
        await uploadScreenRecording();
      } catch {
        toast.error('Ekran kaydı yüklenemedi. Oturumu tamamlamadan önce lütfen tekrar deneyin.');
        return;
      }
    } else if (reason === 'manual' && screenRecordingState === 'recording') {
      screenRecordingFinalizingRef.current = true;
      await stopScreenRecording(true);
      stopScreenStream();
      screenRecordingFinalizingRef.current = false;
    }

    if (reason === 'manual' && sessionId && !isDesignMode) {
      await interviewService.endSessionEarly(sessionId);
    }

    localStorage.removeItem('participant-session');
    releaseMediaDevices();
    setSessionCompletionReason(reason);
    setSessionStatus('completed');
  };

  const designScreens: DesignScreen[] = projectData?.analysis?.designScreens || [];
  const isUsabilityTestingActive = Boolean(projectData?.analysis?.usabilityTesting) || designScreens.length > 0;
  const isScreenRecordingRequired = isUsabilityTestingActive && !isDesignMode;
  const isScreenRecordingReady = !isScreenRecordingRequired || screenRecordingState === 'recording' || screenRecordingState === 'uploaded';
  const showDesignPanels = !isOnboardingActive && designScreens.length > 0;
  const questionsPerScreen = designScreens.length > 0 && currentInterviewProgress.total > 0
    ? Math.max(1, Math.ceil(currentInterviewProgress.total / designScreens.length))
    : 1;

  useEffect(() => {
    if (designScreens.length <= 1 || !currentInterviewQuestion || currentInterviewProgress.total <= 0) {
      setActiveScreenIndex(0);
      return;
    }

    const nextScreenIndex = Math.min(
      Math.floor(currentInterviewQuestion.question_order / questionsPerScreen),
      designScreens.length - 1
    );

    setActiveScreenIndex(nextScreenIndex);
  }, [currentInterviewQuestion, currentInterviewProgress.total, designScreens.length, questionsPerScreen]);

  const activeScreen = designScreens[activeScreenIndex] || null;
  const activeScreenEmbedUrl = activeScreen?.embedUrl || (
    activeScreen?.source === "figma-link"
      ? `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(activeScreen.url)}`
      : null
  );
  const isDeviceCheckBusy = deviceCheckState === 'requesting_permission' || deviceCheckState === 'verifying_camera' || deviceCheckState === 'verifying_microphone';
  const canContinueToInterview = cameraEnabled && cameraStreamVerified && microphoneVerified && deviceCheckState === 'ready';
  const microphoneLevelRatio = microphoneLevelThreshold > 0
    ? Math.min(microphoneLevel / Math.max(microphoneLevelThreshold * 1.4, 1), 1)
    : 0;
  const permissionWasDenied = deviceCheckFailureCode === 'permission_denied';
  const gatePrimaryLabel = permissionWasDenied
    ? 'İzin Ver'
    : deviceCheckState === 'failed'
      ? 'Tekrar Dene'
      : isDeviceCheckBusy
        ? 'Doğrulanıyor...'
        : 'Kamera ve Mikrofonu Aç';
  const permissionHelpText = permissionWasDenied
    ? 'Tarayıcı izni daha önce engellendiyse adres çubuğundaki kamera veya site ayarları simgesinden kamera ve mikrofonu tekrar açın.'
    : null;
  const gateStatusText = (() => {
    if (deviceCheckMessage) {
      return deviceCheckMessage;
    }

    if (deviceCheckState === 'requesting_permission') {
      return 'Tarayıcının izin penceresini onaylayın.';
    }

    if (deviceCheckState === 'verifying_camera') {
      return 'Kamera görüntüsü kontrol ediliyor.';
    }

    if (deviceCheckState === 'verifying_microphone') {
      return 'Lütfen “Merhaba” gibi kısa bir cümle söyleyin. Mikrofon sinyali ölçülüyor.';
    }

    if (deviceCheckState === 'ready') {
      return 'Kamera ve mikrofon hazır. Araştırmaya devam edebilirsiniz.';
    }

    if (deviceCheckFailureCode) {
      return getMicrophoneFailureMessage(deviceCheckFailureCode);
    }

    return 'Araştırmaya girebilmek için önce kamera ve mikrofonunuzu açıp doğrulayalım.';
  })();

  useEffect(() => {
    if (isScreenRecordingRequired && cameraGateCompleted && screenRecordingState === 'not_required') {
      setScreenRecordingState('pending');
      setScreenRecordingMessage('Kullanılabilirlik testine devam etmek için Figma prototipi açıkken ekran paylaşımını başlatın.');
    }

    if (!isScreenRecordingRequired && screenRecordingState !== 'not_required') {
      setScreenRecordingState('not_required');
      setScreenRecordingMessage(null);
    }
  }, [cameraGateCompleted, isScreenRecordingRequired, screenRecordingState]);

  useEffect(() => () => {
    void stopScreenRecording(true);
    stopScreenStream();
  }, [stopScreenRecording, stopScreenStream]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-primary mx-auto mb-4" />
          <p className="text-text-secondary">Oturum yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-text-primary mb-2">Hata</h2>
            <p className="text-text-secondary">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pausedMessage) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <Card className="w-full max-w-xl border-amber-200 bg-amber-50/80 shadow-sm">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Clock className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-semibold text-text-primary mb-3">Araştırma Geçici Olarak Duraklatıldı</h2>
            <p className="text-text-secondary leading-relaxed">
              {pausedMessage}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sessionStatus === 'completed') {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <Card className={`w-full max-w-md overflow-hidden ${sessionCompletionReason === 'completed' ? 'border-emerald-200 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.18),_transparent_42%),linear-gradient(180deg,_#ffffff_0%,_#f0fdf4_100%)] shadow-[0_24px_70px_rgba(16,185,129,0.16)]' : ''}`}>
          <CardContent className="pt-6 text-center">
            {sessionCompletionReason === 'completed' ? (
              <div className="relative">
                <div className="absolute left-1/2 top-8 h-20 w-20 -translate-x-1/2 rounded-full bg-emerald-200/70 blur-xl" />
                <CheckCircle className="relative w-16 h-16 text-emerald-500 mx-auto mb-4" />
              </div>
            ) : (
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            )}
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              {sessionCompletionReason === 'completed' ? 'Görüşme Başarıyla Tamamlandı' : 'Oturum Tamamlandı'}
            </h2>
            <p className="text-text-secondary mb-6">
              {sessionCompletionReason === 'completed'
                ? 'Tüm sorular tamamlandı. Katılımınız için teşekkür ederiz.'
                : 'Oturum erken sonlandırıldı. Bu pencereyi kapatabilirsiniz.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background lg:h-screen lg:overflow-hidden">
      {/* Design Mode Indicator */}
      {isDesignMode && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-brand-primary/90 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg backdrop-blur-sm">
          🎨 Tasarım Modu
        </div>
      )}
      
      {/* Floating Video */}
      <FloatingVideo
        videoRef={videoRef}
        participantName={participantName || undefined}
        isVisible={cameraGateCompleted && cameraEnabled}
      />

      {/* Main Content */}
      <div className="min-h-screen lg:h-full lg:overflow-hidden">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pt-2 pb-6 md:px-6 lg:h-full lg:overflow-hidden lg:gap-3 lg:pt-1 lg:pb-3">
          {showDesignPanels && (
            <div className="shrink-0 rounded-[28px] border border-border-light bg-white/96 p-4 backdrop-blur">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <ImageIcon className="w-4 h-4 text-brand-primary" />
                  Test Ekranlari
                </div>
                <p className="text-xs text-text-secondary">
                  {activeScreenIndex + 1} / {designScreens.length}
                </p>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {designScreens.map((screen, index) => (
                  <div
                    key={`${screen.url}-${index}`}
                    className={`shrink-0 rounded-2xl border px-4 py-3 text-left text-xs transition-colors ${
                      activeScreenIndex === index
                        ? "border-brand-primary bg-brand-primary-light text-brand-primary"
                        : "border-border-light bg-surface hover:border-brand-primary/40"
                    }`}
                  >
                    <p className="font-medium line-clamp-1">{screen.name || `Screen ${index + 1}`}</p>
                    <p className="text-text-muted">
                      {activeScreenIndex === index
                        ? "Bu soruda gösterilen ekran"
                        : "Sıradaki ekran"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`grid flex-1 gap-4 lg:min-h-0 ${showDesignPanels ? "xl:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.08fr)]" : ""}`}>
            {showDesignPanels && activeScreen && (
              <div className="xl:min-h-0 xl:self-stretch">
                <div className="flex h-full flex-col overflow-hidden rounded-[32px] border border-border-light bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                  <div className="border-b border-border-light bg-[linear-gradient(180deg,rgba(124,77,255,0.06),rgba(255,255,255,0.96))] px-5 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">
                          {activeScreen.name || `Screen ${activeScreenIndex + 1}`}
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {activeScreen.source === "figma-link" ? "Figma Link" : "Image"}
                        </p>
                      </div>
                      {activeScreen.source === "figma-link" ? (
                        <a
                          href={activeScreen.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-brand-primary/20 bg-white px-4 py-2 text-xs font-medium text-brand-primary shadow-sm hover:border-brand-primary/40"
                        >
                          Yeni sekmede ac
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex min-h-[420px] flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(124,77,255,0.10),transparent_38%),linear-gradient(180deg,#f8f7ff_0%,#f2f4f8_100%)] p-5 md:min-h-[520px] md:p-8 xl:min-h-0">
                    {activeScreen.source === "figma-link" ? (
                      <div className="flex h-full w-full flex-col gap-3">
                        {activeScreenEmbedUrl ? (
                          <iframe
                            title={activeScreen.name || "Figma prototype"}
                            src={activeScreenEmbedUrl}
                            className="min-h-[520px] w-full flex-1 rounded-[24px] border border-border-light bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]"
                            allowFullScreen
                          />
                        ) : null}
                        <a
                          href={activeScreen.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-primary/20 bg-white px-5 py-3 text-sm font-medium text-brand-primary shadow-sm hover:border-brand-primary/40"
                        >
                          Figma prototipini yeni sekmede aç
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    ) : (
                      <img
                        src={activeScreen.url}
                        alt={activeScreen.name || "Design screen"}
                        className="h-auto max-h-[72vh] w-auto max-w-full rounded-[28px] border border-border-light bg-white object-contain shadow-[0_30px_80px_rgba(15,23,42,0.12)] xl:max-h-full"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {sessionId && projectData && (
              <div className="min-w-0 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
                <SearchoAI
                  isActive={sessionStatus === 'active' && cameraGateCompleted && isScreenRecordingReady}
                  cameraStream={cameraStream}
                  projectContext={{
                    description: projectData.description || '',
                    discussionGuide: projectData.analysis?.discussionGuide || null,
                    researchMode: projectData.analysis?.researchMode === "ai_enhanced" ? "ai_enhanced" : "structured",
                    aiEnhancedBrief: projectData.analysis?.aiEnhancedBrief || null,
                    template: 'interview',
                    sessionId: sessionId,
                    sessionToken,
                    projectId: projectData.id,
                    participantId: participantId,
                    designScreens
                  }}
                  onSessionEnd={handleCompleteSession}
                  onPreambleStateChange={setIsOnboardingActive}
                  onQuestionChange={(question, progress) => {
                    setCurrentInterviewQuestion(question);
                    setCurrentInterviewProgress(progress);
                  }}
                  onMediaReleaseRequested={() => releaseMediaDevices({ preserveGate: true })}
                  onMediaRecoveryRequested={handleMediaRecoveryRequested}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {!cameraGateCompleted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(15,23,42,0.45)] px-4 backdrop-blur-md">
          <Card className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[36px] border border-white/60 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
            <CardContent className="grid max-h-[92vh] gap-6 overflow-y-auto p-5 md:grid-cols-[1.1fr_0.9fr] md:p-8">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-brand-primary">
                  <Camera className="h-3.5 w-3.5" />
                  Kamera ve Mikrofon Gerekli
                </div>
                <div className="space-y-3">
                  <h2 className="text-2xl font-semibold text-text-primary md:text-3xl">
                    Görüşmeye başlamadan önce kamera ve mikrofonunuzu açın
                  </h2>
                  <p className="text-base leading-relaxed text-text-secondary">
                    Bu oturum görüntülü ve sesli yürütülür. Kamera ve mikrofon izni vermeden devam edemezsiniz.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${
                    cameraEnabled && cameraStreamVerified
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : deviceCheckState === 'verifying_camera'
                        ? 'border-brand-primary/30 bg-brand-primary/5 text-brand-primary'
                        : 'border-border-light bg-surface text-text-secondary'
                  }`}>
                    <div className="flex items-center gap-2 font-medium">
                      <Camera className="h-4 w-4" />
                      Kamera
                    </div>
                    <p className="mt-1 text-xs">
                      {cameraEnabled && cameraStreamVerified
                        ? 'Hazır'
                        : deviceCheckState === 'verifying_camera'
                          ? 'Doğrulanıyor'
                          : hasCameraPermission
                            ? 'İzin verildi'
                            : 'İzin bekleniyor'}
                    </p>
                  </div>

                  <div className={`rounded-2xl border px-4 py-3 text-sm ${
                    microphoneVerified
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : deviceCheckState === 'verifying_microphone'
                        ? 'border-brand-primary/30 bg-brand-primary/5 text-brand-primary'
                        : 'border-border-light bg-surface text-text-secondary'
                  }`}>
                    <div className="flex items-center gap-2 font-medium">
                      <Mic className="h-4 w-4" />
                      Mikrofon
                    </div>
                    <p className="mt-1 text-xs">
                      {microphoneVerified
                        ? 'Hazır'
                        : deviceCheckState === 'verifying_microphone'
                          ? 'Ses testi yapılıyor'
                          : hasMicrophonePermission
                            ? 'İzin verildi'
                            : 'İzin bekleniyor'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border-light bg-surface/70 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
                        Mikrofon Sinyali
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {deviceCheckState === 'verifying_microphone'
                          ? 'Lütfen normal sesinizle kısa bir cümle söyleyin.'
                          : 'Mikrofon seviyesini burada göreceksiniz.'}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-text-secondary">
                      Eşik {microphoneLevelThreshold.toFixed(1)}
                    </span>
                  </div>

                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-150 ${
                        microphoneLevelRatio >= 0.85
                          ? 'bg-emerald-500'
                          : microphoneLevelRatio >= 0.45
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                      }`}
                      style={{ width: `${Math.max(6, Math.round(microphoneLevelRatio * 100))}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-text-secondary">
                    <span>Seviye {microphoneLevel.toFixed(1)}</span>
                    <span>
                      {deviceCheckState === 'verifying_microphone'
                        ? 'Ses bekleniyor'
                        : microphoneVerified
                          ? 'Sinyal doğrulandı'
                          : 'Hazır değil'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    onClick={() => void runDeviceCheck()}
                    disabled={isDeviceCheckBusy}
                    size="lg"
                    className={`min-w-[180px] ${
                      isDeviceCheckBusy || deviceCheckState === 'failed' || deviceCheckState === 'idle'
                        ? "bg-brand-primary text-white hover:bg-brand-primary-hover"
                        : "bg-brand-primary text-white hover:bg-brand-primary-hover"
                    }`}
                  >
                    {isDeviceCheckBusy ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {gatePrimaryLabel}
                      </span>
                    ) : (
                      gatePrimaryLabel
                    )}
                  </Button>

                  <Button
                    onClick={() => setCameraGateCompleted(true)}
                    disabled={!canContinueToInterview}
                    size="lg"
                    variant={canContinueToInterview ? 'default' : 'outline'}
                    className={`min-w-[180px] ${
                      canContinueToInterview
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : ""
                    }`}
                  >
                    Devam et
                  </Button>
                </div>

                <div className={`rounded-2xl px-4 py-3 text-sm ${
                  deviceCheckState === 'failed'
                    ? 'border border-red-200 bg-red-50 text-red-700'
                    : 'border border-border-light bg-surface text-text-secondary'
                }`}>
                  {gateStatusText}
                </div>

                {permissionHelpText ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {permissionHelpText}
                  </div>
                ) : null}
              </div>

              <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] border border-border/70 bg-slate-950 shadow-[0_20px_50px_rgba(15,23,42,0.24)]">
                <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3">
                  <div className="rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                    {participantName || 'Katılımcı'}
                  </div>
                  <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-medium text-emerald-100 backdrop-blur">
                    Canlı önizleme
                  </div>
                </div>

                {cameraEnabled ? (
                  <>
                    <video
                      ref={cameraGateVideoRef}
                      autoPlay
                      muted
                      playsInline
                      onLoadedData={() => {
                        setCameraPreviewReady(true);
                      }}
                      onPlaying={() => {
                        setCameraPreviewReady(true);
                      }}
                      onEmptied={() => {
                        if (!cameraStreamVerified) {
                          setCameraPreviewReady(false);
                        }
                      }}
                      onStalled={() => {
                        if (!cameraStreamVerified) {
                          setCameraPreviewReady(false);
                        }
                      }}
                      className={`h-full w-full object-cover transition-opacity duration-300 ${
                        cameraPreviewReady ? 'opacity-100' : 'opacity-0'
                      }`}
                    />

                    {!cameraPreviewReady && (
                      <div className="absolute inset-0 flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.16),_transparent_45%),linear-gradient(180deg,_#111827_0%,_#0f172a_100%)] px-6 text-center">
                        <div className="space-y-3 text-white/85">
                          <Camera className="mx-auto h-12 w-12" />
                          <p className="text-sm leading-relaxed">
                            {cameraStreamVerified
                              ? "Kamera aktif doğrulandı. Bu tarayıcı canlı önizlemeyi göstermeyebilir."
                              : "Canlı görüntü hazırlanıyor. Birkaç saniye içinde doğrulanmazsa yeniden deneyin."}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_45%),linear-gradient(180deg,_#1f2937_0%,_#0f172a_100%)]">
                    <div className="space-y-3 text-center text-white/80">
                      <Camera className="mx-auto h-12 w-12" />
                      <p className="text-sm">Kamera önizlemesi burada görünecek</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {cameraGateCompleted && isScreenRecordingRequired && !isScreenRecordingReady && (
        <div className="fixed inset-0 z-[58] flex items-center justify-center bg-[rgba(15,23,42,0.48)] px-4 backdrop-blur-md">
          <Card className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-white/60 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
            <CardContent className="space-y-6 p-6 md:p-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brand-primary">
                <MonitorUp className="h-3.5 w-3.5" />
                Ekran Kaydı Gerekli
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold text-text-primary md:text-3xl">
                  Figma prototipiyle etkileşiminizi kaydedelim
                </h2>
                <p className="text-base leading-relaxed text-text-secondary">
                  Bu kullanılabilirlik testinde sadece ekran görüntünüz kaydedilir. Mikrofon veya sistem sesi bu kayda dahil edilmez.
                </p>
              </div>
              <div className="rounded-2xl border border-border-light bg-muted/40 p-4 text-sm leading-6 text-text-secondary">
                {screenRecordingMessage || 'Tarayıcı izin penceresinde Figma prototipinin açık olduğu sekmeyi veya pencereyi seçin.'}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void startScreenRecording()}
                  disabled={screenRecordingState === 'requesting' || screenRecordingState === 'uploading'}
                  className="gap-2 bg-brand-primary text-white hover:bg-brand-primary-hover"
                >
                  {screenRecordingState === 'requesting' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MonitorUp className="h-4 w-4" />
                  )}
                  Ekran Paylaşımını Başlat
                </Button>
                {activeScreen?.source === "figma-link" ? (
                  <a
                    href={activeScreen.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-border-light bg-white px-4 text-sm font-medium text-text-primary hover:border-brand-primary/40"
                  >
                    Figma'yı yeni sekmede aç
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default StudySession;
