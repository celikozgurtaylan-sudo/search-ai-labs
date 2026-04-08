import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import SearchoAI from "@/components/SearchoAI";
import { FloatingVideo } from "@/components/FloatingVideo";
import { participantService } from "@/services/participantService";
import { projectService } from "@/services/projectService";
import { InterviewProgress, InterviewQuestion, setInterviewSessionToken } from "@/services/interviewService";
import { CheckCircle, AlertCircle, Loader2, ExternalLink, Image as ImageIcon, Camera, Mic } from "lucide-react";

type CameraValidationState = 'idle' | 'requesting' | 'verifying' | 'preview' | 'stream' | 'failed';

type CameraValidationResult = {
  verified: boolean;
  preview: boolean;
  state: Extract<CameraValidationState, 'preview' | 'stream' | 'failed'>;
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
      <text x="360" y="646" text-anchor="middle" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#1F1635">${title}</text>
      <text x="360" y="720" text-anchor="middle" font-family="Arial, sans-serif" font-size="31" fill="#4E4662">${subtitle}</text>
      <rect x="88" y="830" width="544" height="124" rx="38" fill="rgba(255,255,255,0.94)"/>
      <text x="360" y="907" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="#2F1B55">${cta}</text>
      <rect x="88" y="986" width="544" height="92" rx="34" fill="rgba(46,20,96,0.08)" stroke="rgba(46,20,96,0.18)" stroke-width="4"/>
      <text x="360" y="1044" text-anchor="middle" font-family="Arial, sans-serif" font-size="31" fill="#5B4C7E">Daha sonra bakacagim</text>
      <rect x="248" y="1154" width="224" height="10" rx="5" fill="rgba(31,22,53,0.18)"/>
    </svg>
  `);

// Mock data for design mode
const MOCK_PROJECT_DATA = {
  id: 'mock-project-id',
  title: 'Pop-up Ekrani Ilk Gorunus ve Algilama Testi',
  description: 'Bu bir ornek usability arastirmasi. Katilimcinin kopyalanip yapistirilmis Figma ekranini ilk gorunuste nasil yorumladigini anlamak icin tasarlandi.',
  analysis: {
    designScreens: [
      {
        name: 'Promosyon Pop-up',
        url: createMockScreen('#6E3BFF', 'Ramazan Hediyesi', 'Ilk bakista anlasilir mi?', 'Hemen Katil'),
        source: 'upload'
      },
      {
        name: 'Kayit Alt Ekrani',
        url: createMockScreen('#4D8DFF', 'Dakikalar Icinde Kayit', 'Form alanlari net mi?', 'Kaydi Baslat'),
        source: 'upload'
      }
    ],
    discussionGuide: {
      sections: [
        {
          title: 'Giriş ve Isınma',
          questions: [
            'Bu ekrani ilk gordugunuzde size ne anlatiyor?',
            'Burada ilk olarak ne yapmaniz beklendigini nasil anladiniz?'
          ]
        },
        {
          title: 'Ana Sorular',
          questions: [
            'Bu pop-up size guven veriyor mu, neden?',
            'Dikkatinizi dagitan veya kararsiz birakan alanlar var mi?'
          ]
        }
      ]
    }
  }
};

const StudySession = () => {
  const { sessionToken } = useParams();
  
  // Check if we're in design mode (placeholder tokens or special keywords)
  const isDesignMode = !sessionToken || 
    sessionToken.includes(':') || 
    ['mock', 'design', 'preview', 'test'].includes(sessionToken.toLowerCase());
  
  const [loading, setLoading] = useState(!isDesignMode);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(isDesignMode ? 'mock-session-id' : null);
  const [participantId, setParticipantId] = useState<string | null>(isDesignMode ? 'mock-participant-id' : null);
  const [participantName, setParticipantName] = useState<string | null>(isDesignMode ? 'Örnek Katılımcı' : null);
  const [projectData, setProjectData] = useState<any>(isDesignMode ? MOCK_PROJECT_DATA : null);
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
  const [cameraRequestPending, setCameraRequestPending] = useState(false);
  const [cameraPreviewReady, setCameraPreviewReady] = useState(false);
  const [cameraStreamVerified, setCameraStreamVerified] = useState(false);
  const [microphoneVerified, setMicrophoneVerified] = useState(false);
  const [cameraValidationState, setCameraValidationState] = useState<CameraValidationState>('idle');
  const [cameraValidationMessage, setCameraValidationMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraGateVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const hasShownCameraFailureRef = useRef(false);

  const stopCameraStream = (stream: MediaStream | null) => {
    stream?.getTracks().forEach(track => track.stop());
  };

  const resetCameraState = (message: string | null = null) => {
    setCameraEnabled(false);
    setCameraPreviewReady(false);
    setCameraStreamVerified(false);
    setMicrophoneVerified(false);
    setCameraGateCompleted(false);
    setCameraValidationState(message ? 'failed' : 'idle');
    setCameraValidationMessage(message);
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
        state: 'failed',
        message: 'Kamera akisi baslatilamadi. Lutfen tekrar deneyin.',
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
        const hasRenderedPreview = await waitForRenderedPreview(previewElement);
        if (hasRenderedPreview) {
          return {
            verified: true,
            preview: true,
            state: 'preview',
            message: null,
          };
        }
      }
    }

    if (await verifyTrackWithImageCapture(videoTrack)) {
      return {
        verified: true,
        preview: false,
        state: 'stream',
        message: 'Tarayiciniz canli onizlemeyi gostermese de kameraniz aktif olarak dogrulandi. Devam edebilirsiniz.',
      };
    }

    if (await verifyTrackWithRecorder(stream)) {
      return {
        verified: true,
        preview: false,
        state: 'stream',
        message: 'Tarayiciniz canli onizlemeyi gostermese de kameraniz aktif olarak dogrulandi. Devam edebilirsiniz.',
      };
    }

    return {
      verified: false,
      preview: false,
      state: 'failed',
      message: 'Canli kamera goruntusu dogrulanamadi. Kamerayi yeniden deneyin.',
    };
  };

  useEffect(() => {
    // Skip initialization in design mode
    if (isDesignMode) {
      setInterviewSessionToken(null);
      console.log('Design mode active - using mock data');
      setLoading(false);
      void requestCameraAccess();
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
    
    void checkCameraPermissions();

    return () => {
      setInterviewSessionToken(null);
      stopCameraStream(cameraStreamRef.current);
    };
  }, [sessionToken]);

  useEffect(() => {
    cameraStreamRef.current = cameraStream;
  }, [cameraStream]);

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
    if (cameraGateCompleted || cameraEnabled || cameraRequestPending || cameraValidationState === 'failed') return;
    void requestCameraAccess();
  }, [cameraGateCompleted, cameraEnabled, cameraRequestPending, cameraValidationState]);

  useEffect(() => {
    if (!cameraStream) return;

    const videoTrack = cameraStream.getVideoTracks()[0];
    if (!videoTrack) return;

    let disconnected = false;

    const handleTrackInterrupted = () => {
      if (disconnected) return;
      disconnected = true;

      stopCameraStream(cameraStream);
      setCameraStream(null);
      resetCameraState("Kamera baglantisi kesildi. Devam etmeden once yeniden baglanin.");
      if (!hasShownCameraFailureRef.current) {
        toast.error("Kamera baglantisi kesildi. Oturum devam etmeden once kamerayi yeniden acin.");
        hasShownCameraFailureRef.current = true;
      }
    };

    videoTrack.addEventListener('ended', handleTrackInterrupted);
    const healthInterval = window.setInterval(() => {
      if (!isLiveVideoTrack(videoTrack)) {
        handleTrackInterrupted();
      }
    }, 1200);

    return () => {
      videoTrack.removeEventListener('ended', handleTrackInterrupted);
      window.clearInterval(healthInterval);
    };
  }, [cameraStream]);

  const initializeSession = async () => {
    try {
      setLoading(true);

      const cachedParticipantSession = localStorage.getItem('participant-session');
      if (cachedParticipantSession && sessionToken) {
        const parsed = JSON.parse(cachedParticipantSession);
        if (parsed?.token === sessionToken && parsed?.session) {
          const cachedSession = parsed.session;
          const cachedParticipant = parsed.participant;

          setSessionId(cachedSession.id || null);
          setParticipantId(cachedSession.participant_id || cachedParticipant?.id || null);
          setParticipantName(cachedParticipant?.name || cachedParticipant?.email || 'Katilimci');

          const project = await projectService.getProjectBySessionToken(sessionToken);
          if (!project) {
            setError("Proje bilgileri yüklenemedi");
            return;
          }

          setProjectData(project);

          setSessionStatus('active');
          return;
        }
      }
      
      // Fetch session data using the token
      const session = await participantService.getSessionByToken(sessionToken!);
      
      if (!session) {
        setError("Oturum bulunamadı veya süresi doldu");
        return;
      }

      console.log('Session loaded:', session);
      setSessionId(session.id!);
      setParticipantId(session.participant_id || null);
      
      // Fetch project data using the session token
      const project = await projectService.getProjectBySessionToken(sessionToken!);
      
      if (!project) {
        setError("Proje bilgileri yüklenemedi");
        return;
      }

      console.log('Project loaded:', project);
      setProjectData(project);
      
      setSessionStatus('active');
    } catch (error) {
      console.error('Failed to initialize session:', error);
      setError("Oturum başlatılırken hata oluştu");
      toast.error("Oturum başlatılırken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const checkCameraPermissions = async () => {
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
          stopCameraStream(cameraStreamRef.current);
          setCameraStream(null);
          resetCameraState("Tarayici kamera iznini kapatti. Devam etmek icin kamera ve mikrofon iznini yeniden acin.");
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
            stopCameraStream(cameraStreamRef.current);
            setCameraStream(null);
            resetCameraState("Tarayici mikrofon iznini kapatti. Devam etmek icin kamera ve mikrofon iznini yeniden acin.");
          }
        };

        if (granted && microphoneGranted && !cameraStream) {
          await requestCameraAccess();
        }
        return;
      } catch (error) {
        console.warn('Microphone permissions API not available:', error);
      }

      if (granted && !cameraStream) {
        await requestCameraAccess();
      }
    } catch (error) {
      console.error('Error checking camera permissions:', error);
    }
  };

  const requestCameraAccess = async () => {
    setCameraRequestPending(true);
    setCameraValidationState('requesting');
    setCameraValidationMessage(null);
    hasShownCameraFailureRef.current = false;

    try {
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
        setCameraStream(null);
        setHasMicrophonePermission(false);
        resetCameraState("Mikrofon baglantisi dogrulanamadi. Devam etmek icin mikrofonu yeniden deneyin.");
        toast.error("Mikrofon baglantisi dogrulanamadi.");
        return false;
      }

      stopCameraStream(cameraStreamRef.current);
      setCameraStream(stream);
      setCameraEnabled(true);
      setHasCameraPermission(true);
      setHasMicrophonePermission(true);
      setMicrophoneVerified(true);
      setCameraPreviewReady(false);
      setCameraStreamVerified(false);
      setCameraValidationState('verifying');
      setCameraValidationMessage("Kamera ve mikrofon baglantisi dogrulaniyor...");

      const validation = await validateCameraStream(stream);

      if (!validation.verified) {
        stopCameraStream(stream);
        setCameraStream(null);
        resetCameraState(validation.message);
        toast.error(validation.message || "Canli kamera goruntusu dogrulanamadi.");
        return false;
      }

      setCameraStreamVerified(true);
      setCameraPreviewReady(validation.preview);
      setCameraValidationState(validation.state);
      setCameraValidationMessage(validation.message);
      return true;
    } catch (error) {
      console.error('Error accessing camera:', error);
      const errorName = error instanceof DOMException ? error.name : '';
      const permissionDenied = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(errorName);
      const cameraUnavailable = ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError', 'NotReadableError', 'TrackStartError'].includes(errorName);
      const message = permissionDenied
        ? "Devam etmek icin kamera ve mikrofon izni vermelisiniz."
        : cameraUnavailable
          ? "Kamera veya mikrofon bulunamadi ya da kullanilamiyor. Lutfen cihazlarinizi kontrol edip tekrar deneyin."
          : "Kamera ve mikrofon baslatilamadi. Lutfen tekrar deneyin.";

      setHasCameraPermission(false);
      setHasMicrophonePermission(false);
      resetCameraState(message);
      toast.error(message);
      return false;
    } finally {
      setCameraRequestPending(false);
    }
  };

  const handleCompleteSession = (reason: 'manual' | 'completed' = 'manual') => {
    localStorage.removeItem('participant-session');
    setSessionCompletionReason(reason);
    setSessionStatus('completed');
  };

  const designScreens: Array<{ name?: string; url: string; source?: string }> = projectData?.analysis?.designScreens || [];
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
    <div className="min-h-screen bg-background">
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
      <div className="min-h-screen">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pt-2 pb-6 md:px-6">
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
                        ? "Bu soruda gosterilen ekran"
                        : "Siradaki ekran"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`grid gap-4 ${showDesignPanels ? "xl:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.08fr)]" : ""}`}>
            {showDesignPanels && activeScreen && (
              <div className="xl:sticky xl:top-6 xl:self-start">
                <div className="overflow-hidden rounded-[32px] border border-border-light bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
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

                  <div className="flex min-h-[480px] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(124,77,255,0.10),transparent_38%),linear-gradient(180deg,#f8f7ff_0%,#f2f4f8_100%)] p-5 md:min-h-[620px] md:p-8">
                    {activeScreen.source === "figma-link" ? (
                      <a
                        href={activeScreen.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-brand-primary/20 bg-white px-5 py-3 text-sm font-medium text-brand-primary shadow-sm hover:border-brand-primary/40"
                      >
                        Figma ekranini yeni sekmede ac
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : (
                      <img
                        src={activeScreen.url}
                        alt={activeScreen.name || "Design screen"}
                        className="max-h-[72vh] w-auto max-w-full rounded-[28px] border border-border-light bg-white object-contain shadow-[0_30px_80px_rgba(15,23,42,0.12)]"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {sessionId && projectData && (
              <div className="min-w-0">
                <SearchoAI
                  isActive={sessionStatus === 'active' && cameraGateCompleted}
                  cameraStream={cameraStream}
                  projectContext={{
                    description: projectData.description || '',
                    discussionGuide: projectData.analysis?.discussionGuide || null,
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
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {!cameraGateCompleted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(15,23,42,0.45)] px-4 backdrop-blur-md">
          <Card className="w-full max-w-3xl overflow-hidden rounded-[36px] border border-white/60 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
            <CardContent className="grid gap-8 p-6 md:grid-cols-[1.1fr_0.9fr] md:p-8">
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
                      : 'border-border-light bg-surface text-text-secondary'
                  }`}>
                    <div className="flex items-center gap-2 font-medium">
                      <Camera className="h-4 w-4" />
                      Kamera
                    </div>
                    <p className="mt-1 text-xs">
                      {cameraEnabled && cameraStreamVerified ? 'Hazir' : hasCameraPermission ? 'Dogrulaniyor' : 'Izin bekleniyor'}
                    </p>
                  </div>

                  <div className={`rounded-2xl border px-4 py-3 text-sm ${
                    microphoneVerified
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-border-light bg-surface text-text-secondary'
                  }`}>
                    <div className="flex items-center gap-2 font-medium">
                      <Mic className="h-4 w-4" />
                      Mikrofon
                    </div>
                    <p className="mt-1 text-xs">
                      {microphoneVerified ? 'Hazir' : hasMicrophonePermission ? 'Dogrulaniyor' : 'Izin bekleniyor'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    onClick={() => setCameraGateCompleted(true)}
                    disabled={!cameraEnabled || !cameraStreamVerified || !microphoneVerified}
                    size="lg"
                    className={`min-w-[180px] ${
                      cameraEnabled && cameraStreamVerified && microphoneVerified
                        ? "bg-brand-primary text-white hover:bg-brand-primary-hover"
                        : "bg-muted text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Devam et
                  </Button>

                  {cameraValidationState === 'failed' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="min-w-[180px]"
                      onClick={() => void requestCameraAccess()}
                      disabled={cameraRequestPending}
                    >
                      Kamera ve mikrofonu yeniden dene
                    </Button>
                  )}
                </div>

                {!cameraEnabled && !microphoneVerified && !cameraRequestPending && !cameraValidationMessage && (
                  <p className="text-sm text-text-secondary">
                    Kamera ve mikrofon izni gerekiyor. Tarayıcı izin penceresini onaylayın.
                  </p>
                )}

                {cameraRequestPending && (
                  <p className="text-sm text-text-secondary">
                    Kamera ve mikrofon izni isteniyor...
                  </p>
                )}

                {cameraEnabled && microphoneVerified && cameraValidationState === 'verifying' && !cameraRequestPending && (
                  <p className="text-sm text-text-secondary">
                    Kamera ve mikrofon baglandi. Baglanti dogrulaniyor...
                  </p>
                )}

                {cameraValidationMessage && (
                  <p className="text-sm text-text-secondary">
                    {cameraValidationMessage}
                  </p>
                )}
              </div>

              <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-slate-950 shadow-[0_20px_50px_rgba(15,23,42,0.24)]">
                <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3">
                  <div className="rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                    {participantName || 'Katilimci'}
                  </div>
                  <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-medium text-emerald-100 backdrop-blur">
                    Canli onizleme
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
                        if (cameraStreamVerified) {
                          setCameraPreviewReady(true);
                        }
                      }}
                      onPlaying={() => {
                        if (cameraStreamVerified) {
                          setCameraPreviewReady(true);
                        }
                      }}
                      onEmptied={() => setCameraPreviewReady(false)}
                      onStalled={() => setCameraPreviewReady(false)}
                      className={`aspect-[4/3] h-full w-full object-cover transition-opacity duration-300 ${
                        cameraPreviewReady ? 'opacity-100' : 'opacity-0'
                      }`}
                    />

                    {!cameraPreviewReady && (
                      <div className="absolute inset-0 flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.16),_transparent_45%),linear-gradient(180deg,_#111827_0%,_#0f172a_100%)] px-6 text-center">
                        <div className="space-y-3 text-white/85">
                          <Camera className="mx-auto h-12 w-12" />
                          <p className="text-sm leading-relaxed">
                            {cameraStreamVerified
                              ? "Kamera aktif dogrulandi. Bu tarayici canli onizlemeyi gostermeyebilir."
                              : "Canli goruntu hazirlaniyor. Birkac saniye icinde dogrulanmazsa yeniden deneyin."}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_45%),linear-gradient(180deg,_#1f2937_0%,_#0f172a_100%)]">
                    <div className="space-y-3 text-center text-white/80">
                      <Camera className="mx-auto h-12 w-12" />
                      <p className="text-sm">Kamera onizlemesi burada gorunecek</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default StudySession;
