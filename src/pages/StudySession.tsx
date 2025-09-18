import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, User, Video, MessageSquare, Camera, Monitor } from "lucide-react";
import { StudyParticipant } from "@/services/participantService";
import SearchoAI from "@/components/SearchoAI";

const StudySession = () => {
  const { sessionToken } = useParams();
  const location = useLocation();
  const { participant, projectId, projectData } = location.state || {};
  const [sessionStatus, setSessionStatus] = useState<'waiting' | 'active' | 'completed'>('waiting');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // Check camera permissions on session start
  useEffect(() => {
    if (sessionStatus === 'active') {
      checkCameraPermissions();
    }
    
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [sessionStatus]);

  const checkCameraPermissions = async () => {
    try {
      // Check if camera permission is already granted
      const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
      setCameraPermissionGranted(permissionStatus.state === 'granted');
    } catch (error) {
      console.error('Error checking camera permissions:', error);
    }
  };

  const initializeCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false // Audio handled by SearchoAI
      });
      setCameraStream(stream);
      setCameraEnabled(true);
      setCameraPermissionGranted(true);
      
      // Ensure video element gets the stream with a small delay to handle React updates
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.error);
        }
      }, 100);
    } catch (error) {
      console.error('Error accessing camera:', error);
      setCameraPermissionGranted(false);
      setCameraEnabled(false);
    }
  };

  const toggleCamera = async () => {
    if (cameraEnabled && cameraStream) {
      // Turn off camera
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setCameraEnabled(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } else {
      // Turn on camera
      setCameraEnabled(true); // Set this first for UI feedback
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false // Audio handled by SearchoAI
        });
        setCameraStream(stream);
        setCameraPermissionGranted(true);
        
        // Ensure video element gets the stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Force the video to load and play
          try {
            await videoRef.current.play();
          } catch (playError) {
            console.log('Video autoplay prevented, will play on user interaction');
          }
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setCameraPermissionGranted(false);
        setCameraEnabled(false); // Reset if failed
      }
    }
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      setIsScreenSharing(true);
      if (videoRef.current) {
        videoRef.current.srcObject = screenStream;
      }
      
      // Listen for screen share end
      screenStream.getVideoTracks()[0].addEventListener('ended', () => {
        setIsScreenSharing(false);
        initializeCamera(); // Switch back to camera
      });
    } catch (error) {
      console.error('Error starting screen share:', error);
    }
  };

  useEffect(() => {
    // Simulate session lifecycle
    const timer1 = setTimeout(() => {
      setSessionStatus('active');
    }, 3000);

    return () => {
      clearTimeout(timer1);
    };
  }, []);

  const handleCompleteSession = () => {
    setSessionStatus('completed');
    // Here you would normally update the participant status to 'completed'
  };

  if (sessionStatus === 'completed') {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-16 h-16 text-status-success mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-text-primary mb-4">Teşekkürler!</h2>
            <p className="text-text-secondary mb-6">
              Araştırmamıza katılım sağladığınız için çok teşekkür ederiz. 
              Verdiğiniz geri bildirimler bizim için çok değerli.
            </p>
            <p className="text-sm text-text-muted">
              Bu pencereyi güvenle kapatabilirsiniz.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="border-b border-border-light bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-text-primary">Kullanıcı Araştırması</h1>
              <p className="text-text-secondary text-sm">
                Oturum: {sessionToken?.substring(0, 8)}...
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div>Görüşme başladı</div>
              <Badge variant={sessionStatus === 'active' ? 'default' : 'outline'}>
                {sessionStatus === 'waiting' && (
                  <>
                    <Clock className="w-3 h-3 mr-1" />
                    Bekliyor
                  </>
                )}
                {sessionStatus === 'active' && (
                  <>
                    <Video className="w-3 h-3 mr-1" />
                    Görüşme Devam Ediyor
                  </>
                )}
              </Badge>
              
              <span className="text-sm text-text-secondary">
                {currentTime.toLocaleTimeString('tr-TR')}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {sessionStatus === 'waiting' ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Card className="w-full max-w-lg">
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Clock className="w-12 h-12 text-brand-primary mx-auto mb-4 animate-pulse" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    Searcho AI Hazırlanıyor...
                  </h3>
                  <p className="text-text-secondary">
                    Lütfen bekleyin, AI asistanı kısa süre içinde sizinle görüşmeye başlayacak.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[70vh]">
            {/* Left Side - Participant Video & Info */}
            <div className="lg:col-span-5 space-y-6">
              {/* Video Feed */}
              <Card className="h-80">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center space-x-2">
                      <Camera className="w-5 h-5" />
                      <span>{isScreenSharing ? 'Ekran Paylaşımı' : 'Kamera'}</span>
                    </span>
                    <div className="flex space-x-2">
                      <Button
                        variant={cameraEnabled ? "default" : "outline"}
                        size="sm"
                        onClick={toggleCamera}
                        className={cameraEnabled ? "bg-green-600 hover:bg-green-700" : ""}
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        {cameraEnabled ? 'Kamerayı Kapat' : 'Kamerayı Aç'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={startScreenShare}
                        disabled={isScreenSharing || !cameraEnabled}
                      >
                        <Monitor className="w-4 h-4 mr-2" />
                        Ekran Paylaş
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {cameraEnabled ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      className="w-full h-48 bg-surface rounded-lg object-cover"
                      playsInline
                      onLoadedMetadata={() => {
                        // Ensure video starts playing when metadata is loaded
                        if (videoRef.current && cameraStream) {
                          videoRef.current.play().catch(console.error);
                        }
                      }}
                      style={{ 
                        display: cameraStream ? 'block' : 'none',
                        backgroundColor: '#f3f4f6' 
                      }}
                    />
                  ) : null}
                  
                  {/* Always show placeholder when camera is off or no stream */}
                  {(!cameraEnabled || !cameraStream) && (
                    <div className="w-full h-48 bg-surface rounded-lg flex items-center justify-center">
                      <div className="text-center">
                        <Camera className="w-12 h-12 text-text-muted mx-auto mb-2" />
                        <p className="text-text-secondary text-sm">
                          {!cameraEnabled 
                            ? 'Kamera kapalı' 
                            : cameraPermissionGranted 
                              ? 'Kamera başlatılıyor...' 
                              : 'Kamera izni gerekli'
                          }
                        </p>
                        {!cameraPermissionGranted && !cameraEnabled && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={toggleCamera}
                            className="mt-2"
                          >
                            İzin Ver
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-center space-x-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${
                        isScreenSharing 
                          ? 'bg-blue-500' 
                          : cameraEnabled && cameraStream 
                            ? 'bg-green-500' 
                            : 'bg-red-500'
                      }`}></div>
                      <span className="text-text-secondary">
                        {isScreenSharing 
                          ? 'Ekran paylaşılıyor' 
                          : cameraEnabled && cameraStream 
                            ? 'Kamera aktif' 
                            : cameraEnabled 
                              ? 'Kamera başlatılıyor...'
                              : 'Kamera kapalı'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Participant Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <User className="w-5 h-5" />
                    <span>Katılımcı Bilgileri</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-text-secondary">İsim</label>
                    <p className="text-text-primary">{participant?.name || 'Anonim Katılımcı'}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-text-secondary">E-posta</label>
                    <p className="text-text-primary text-sm">{participant?.email}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-text-secondary">Durum</label>
                    <div className="mt-1">
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Aktif Sesion
                      </Badge>
                    </div>
                  </div>

                  {projectData && (
                    <div>
                      <label className="text-sm font-medium text-text-secondary">Proje</label>
                      <p className="text-text-primary text-sm">{projectData.title}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Side - Searcho AI */}
            <div className="lg:col-span-7">
              <Card className="h-[80vh] flex flex-col">
                <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
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
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudySession;