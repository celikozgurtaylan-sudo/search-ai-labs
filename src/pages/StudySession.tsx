import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import SearchoAI from "@/components/SearchoAI";
import { FloatingVideo } from "@/components/FloatingVideo";
import { participantService } from "@/services/participantService";
import { projectService } from "@/services/projectService";
import { interviewService } from "@/services/interviewService";
import { CheckCircle, AlertCircle, Loader2, ExternalLink, Image as ImageIcon, Camera } from "lucide-react";

// Mock data for design mode
const MOCK_PROJECT_DATA = {
  id: 'mock-project-id',
  title: 'Kullanıcı Deneyimi Araştırması',
  description: 'Bu bir örnek araştırma projesidir. Kullanıcıların mobil uygulama deneyimlerini anlamak için tasarlanmıştır.',
  analysis: {
    discussionGuide: {
      sections: [
        {
          title: 'Giriş ve Isınma',
          questions: [
            'Kendinizden bahseder misiniz?',
            'Günlük teknoloji kullanımınızdan bahseder misiniz?'
          ]
        },
        {
          title: 'Ana Sorular',
          questions: [
            'Mobil uygulamaları kullanırken en çok neye dikkat ediyorsunuz?',
            'En son karşılaştığınız kullanıcı deneyimi problemi neydi?'
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
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [cameraGateCompleted, setCameraGateCompleted] = useState(false);
  const [cameraRequestPending, setCameraRequestPending] = useState(false);
  const [cameraPreviewReady, setCameraPreviewReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraGateVideoRef = useRef<HTMLVideoElement>(null);
  const previewFailureTimerRef = useRef<number | null>(null);
  const hasShownCameraFailureRef = useRef(false);

  useEffect(() => {
    // Skip initialization in design mode
    if (isDesignMode) {
      console.log('Design mode active - using mock data');
      setLoading(false);
      void requestCameraAccess();
      return;
    }
    
    if (sessionToken) {
      initializeSession();
    } else {
      setError("Geçersiz oturum");
      setLoading(false);
    }
    
    void checkCameraPermissions();

    return () => {
      if (previewFailureTimerRef.current) {
        window.clearTimeout(previewFailureTimerRef.current);
      }
      cameraStream?.getTracks().forEach(track => track.stop());
    };
  }, [sessionToken]);

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
    if (!cameraStream) {
      setCameraPreviewReady(false);
      return;
    }

    const interval = window.setInterval(() => {
      const previewElement = cameraGateCompleted ? videoRef.current : cameraGateVideoRef.current;
      const hasLiveFrame = Boolean(
        previewElement &&
        previewElement.srcObject &&
        previewElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        previewElement.videoWidth > 0 &&
        previewElement.videoHeight > 0 &&
        !previewElement.paused &&
        !previewElement.ended
      );

      if (hasLiveFrame) {
        if (previewFailureTimerRef.current) {
          window.clearTimeout(previewFailureTimerRef.current);
          previewFailureTimerRef.current = null;
        }
        hasShownCameraFailureRef.current = false;
        setCameraPreviewReady(true);
        return;
      }

      setCameraPreviewReady(false);

      if (!cameraGateCompleted || previewFailureTimerRef.current) return;

      previewFailureTimerRef.current = window.setTimeout(() => {
        setCameraGateCompleted(false);
        if (!hasShownCameraFailureRef.current) {
          toast.error("Kamera goruntusu kesildi. Devam etmeden once yeniden baglanin.");
          hasShownCameraFailureRef.current = true;
        }
        previewFailureTimerRef.current = null;
      }, 1500);
    }, 400);

    return () => {
      window.clearInterval(interval);
      if (previewFailureTimerRef.current) {
        window.clearTimeout(previewFailureTimerRef.current);
        previewFailureTimerRef.current = null;
      }
    };
  }, [cameraStream, cameraGateCompleted]);

  useEffect(() => {
    if (cameraGateCompleted || cameraEnabled || cameraRequestPending) return;
    void requestCameraAccess();
  }, [cameraGateCompleted, cameraEnabled, cameraRequestPending]);

  useEffect(() => {
    if (!cameraStream) return;

    const videoTrack = cameraStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const handleTrackInterrupted = () => {
      setCameraPreviewReady(false);
      setCameraGateCompleted(false);
      if (!hasShownCameraFailureRef.current) {
        toast.error("Kamera baglantisi kesildi. Oturum devam etmeden once kamerayi yeniden acin.");
        hasShownCameraFailureRef.current = true;
      }
    };

    const handleTrackResumed = () => {
      hasShownCameraFailureRef.current = false;
    };

    videoTrack.addEventListener('ended', handleTrackInterrupted);
    videoTrack.addEventListener('mute', handleTrackInterrupted);
    videoTrack.addEventListener('unmute', handleTrackResumed);

    return () => {
      videoTrack.removeEventListener('ended', handleTrackInterrupted);
      videoTrack.removeEventListener('mute', handleTrackInterrupted);
      videoTrack.removeEventListener('unmute', handleTrackResumed);
    };
  }, [cameraStream]);

  const initializeSession = async () => {
    try {
      setLoading(true);
      
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
      
      // Initialize interview questions
      if (project.analysis?.discussionGuide) {
        console.log('Initializing questions...');
        await interviewService.initializeQuestions(
          project.id!,
          session.id!,
          project.analysis.discussionGuide
        );
      }
      
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
      const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
      const granted = permissionStatus.state === 'granted';
      setHasCameraPermission(granted);

      permissionStatus.onchange = () => {
        const isGranted = permissionStatus.state === 'granted';
        setHasCameraPermission(isGranted);
        if (!isGranted) {
          setCameraGateCompleted(false);
        }
      };

      if (granted && !cameraStream) {
        await requestCameraAccess();
      }
    } catch (error) {
      console.error('Error checking camera permissions:', error);
    }
  };

  const requestCameraAccess = async () => {
    setCameraRequestPending(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 960 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false
      });

      cameraStream?.getTracks().forEach(track => track.stop());
      setCameraStream(stream);
      setCameraEnabled(true);
      setHasCameraPermission(true);
      setCameraPreviewReady(false);
      hasShownCameraFailureRef.current = false;
      return true;
    } catch (error) {
      console.error('Error accessing camera:', error);
      setHasCameraPermission(false);
      setCameraEnabled(false);
      setCameraPreviewReady(false);
      toast.error("Devam etmek için kamera izni vermelisiniz");
      return false;
    } finally {
      setCameraRequestPending(false);
    }
  };

  const handleCompleteSession = () => {
    setSessionStatus('completed');
  };

  const designScreens: Array<{ name?: string; url: string; source?: string }> = projectData?.analysis?.designScreens || [];
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
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              Oturum Tamamlandı
            </h2>
            <p className="text-text-secondary mb-6">
              Katılımınız için teşekkür ederiz. Bu pencereyi kapatabilirsiniz.
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
        isVisible={cameraGateCompleted && cameraEnabled && cameraPreviewReady}
      />

      {/* Main Content */}
      <div className="min-h-screen flex flex-col">
        {designScreens.length > 0 && (
          <div className="shrink-0 border-b border-border-light bg-white/96 backdrop-blur">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-6">
              <div className="flex items-center justify-between gap-3">
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
                  <button
                    key={`${screen.url}-${index}`}
                    type="button"
                    onClick={() => setActiveScreenIndex(index)}
                    className={`shrink-0 rounded-2xl border px-4 py-3 text-left text-xs transition-colors ${
                      activeScreenIndex === index
                        ? "border-brand-primary bg-brand-primary-light text-brand-primary"
                        : "border-border-light bg-surface hover:border-brand-primary/40"
                    }`}
                  >
                    <p className="font-medium line-clamp-1">{screen.name || `Screen ${index + 1}`}</p>
                    <p className="text-text-muted">{screen.source === "figma-link" ? "Figma Link" : "Image"}</p>
                  </button>
                ))}
              </div>

              {activeScreen && (
                <div className="flex min-h-[320px] max-h-[44vh] items-center justify-center rounded-[32px] border border-border-light bg-[#f7f7f5] p-4 md:p-8">
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
                      className="max-h-[36vh] w-auto max-w-full rounded-[28px] border border-border-light bg-white object-contain shadow-[0_24px_60px_rgba(15,23,42,0.10)] md:max-h-[38vh]"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {sessionId && projectData && (
          <div className="flex-1">
            <SearchoAI
              isActive={sessionStatus === 'active' && cameraGateCompleted}
              projectContext={{
                description: projectData.description || '',
                discussionGuide: projectData.analysis?.discussionGuide || null,
                template: 'interview',
                sessionId: sessionId,
                projectId: projectData.id,
                participantId: participantId,
                designScreens
              }}
              onSessionEnd={handleCompleteSession}
            />
          </div>
        )}
      </div>

      {!cameraGateCompleted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(15,23,42,0.45)] px-4 backdrop-blur-md">
          <Card className="w-full max-w-3xl overflow-hidden rounded-[36px] border border-white/60 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
            <CardContent className="grid gap-8 p-6 md:grid-cols-[1.1fr_0.9fr] md:p-8">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-brand-primary">
                  <Camera className="h-3.5 w-3.5" />
                  Kamera Gerekli
                </div>
                <div className="space-y-3">
                  <h2 className="text-2xl font-semibold text-text-primary md:text-3xl">
                    Görüşmeye başlamadan önce kameranızı açın
                  </h2>
                  <p className="text-base leading-relaxed text-text-secondary">
                    Bu oturum görüntülü yürütülür. Kamera izni vermeden devam edemezsiniz.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    onClick={() => setCameraGateCompleted(true)}
                    disabled={!cameraEnabled || !cameraPreviewReady}
                    size="lg"
                    className={`min-w-[180px] ${
                      cameraEnabled && cameraPreviewReady
                        ? "bg-brand-primary text-white hover:bg-brand-primary-hover"
                        : "bg-muted text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Devam et
                  </Button>
                </div>

                {!cameraEnabled && !cameraRequestPending && (
                  <p className="text-sm text-text-secondary">
                    Kamera izni gerekiyor. Tarayıcı izin penceresini onaylayın.
                  </p>
                )}

                {cameraRequestPending && (
                  <p className="text-sm text-text-secondary">
                    Kamera izni isteniyor...
                  </p>
                )}

                {cameraEnabled && !cameraPreviewReady && !cameraRequestPending && (
                  <p className="text-sm text-text-secondary">
                    Kamera baglandi. Canli goruntu hazir olunca devam edebilirsiniz.
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
                  <video
                    ref={cameraGateVideoRef}
                    autoPlay
                    muted
                    playsInline
                    onLoadedData={() => setCameraPreviewReady(true)}
                    onPlaying={() => setCameraPreviewReady(true)}
                    onEmptied={() => setCameraPreviewReady(false)}
                    onStalled={() => setCameraPreviewReady(false)}
                    className="aspect-[4/3] h-full w-full object-cover"
                  />
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
