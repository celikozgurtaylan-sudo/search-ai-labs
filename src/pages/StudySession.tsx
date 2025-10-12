import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import SearchoAI from "@/components/SearchoAI";
import { FloatingVideo } from "@/components/FloatingVideo";
import { participantService } from "@/services/participantService";
import { projectService } from "@/services/projectService";
import { interviewService } from "@/services/interviewService";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

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
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Skip initialization in design mode
    if (isDesignMode) {
      console.log('Design mode active - using mock data');
      setLoading(false);
      return;
    }
    
    if (sessionToken) {
      initializeSession();
    } else {
      setError("Geçersiz oturum");
      setLoading(false);
    }
    
    checkCameraPermissions();

    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [sessionToken]);

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
      setHasCameraPermission(permissionStatus.state === 'granted');
    } catch (error) {
      console.error('Error checking camera permissions:', error);
    }
  };

  const toggleCamera = async () => {
    if (cameraEnabled && cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setCameraEnabled(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false
        });
        setCameraStream(stream);
        setCameraEnabled(true);
        setHasCameraPermission(true);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.error);
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        setCameraEnabled(false);
      }
    }
  };

  const handleCompleteSession = () => {
    setSessionStatus('completed');
  };

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
        isEnabled={cameraEnabled}
        onToggle={toggleCamera}
        participantName={participantName || undefined}
      />

      {/* Main Content */}
      <div className="h-screen flex flex-col">
        {sessionId && projectData && (
          <SearchoAI
            isActive={sessionStatus === 'active'}
            projectContext={{
              description: projectData.description || '',
              discussionGuide: projectData.analysis?.discussionGuide || null,
              template: 'interview',
              sessionId: sessionId,
              projectId: projectData.id,
              participantId: participantId
            }}
            onSessionEnd={handleCompleteSession}
          />
        )}
      </div>
    </div>
  );
};

export default StudySession;
