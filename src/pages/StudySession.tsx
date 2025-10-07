import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SearchoAI from "@/components/SearchoAI";
import { FloatingVideo } from "@/components/FloatingVideo";

interface ParticipantData {
  name: string;
  email: string;
}

const StudySession = () => {
  const { sessionToken } = useParams();
  const location = useLocation();
  const { participant, projectId, projectData } = location.state || {};
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [sessionStatus, setSessionStatus] = useState<'waiting' | 'active' | 'completed'>('waiting');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  useEffect(() => {
    checkCameraPermissions();
    
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [sessionStatus]);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setSessionStatus('active');
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleCompleteSession = () => {
    setSessionStatus('completed');
  };

  if (sessionStatus === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold mb-4">Teşekkürler!</h2>
          <p className="text-muted-foreground mb-6">
            Oturumunuz tamamlandı. Bu araştırmaya katılımınız için teşekkür ederiz.
          </p>
          <p className="text-sm text-muted-foreground">
            Bu pencereyi güvenle kapatabilirsiniz.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Floating Video */}
      <FloatingVideo
        videoRef={videoRef}
        isEnabled={cameraEnabled}
        onToggle={toggleCamera}
        participantName={participant?.name}
      />

      {/* Main Content */}
      <div className="h-screen flex flex-col">
        <SearchoAI
          isActive={sessionStatus === 'active'}
          projectContext={{
            description: projectData?.description || '',
            discussionGuide: projectData?.analysis?.discussionGuide || null,
            template: 'interview',
            sessionId: crypto.randomUUID(),
            projectId: projectData?.id,
            participantId: participant?.id || crypto.randomUUID()
          }}
          onSessionEnd={handleCompleteSession}
        />
      </div>
    </div>
  );
};

export default StudySession;
