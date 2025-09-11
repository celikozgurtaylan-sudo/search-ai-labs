import { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, User, Video, MessageSquare } from "lucide-react";
import { StudyParticipant } from "@/services/participantService";

const StudySession = () => {
  const { sessionToken } = useParams();
  const location = useLocation();
  const { participant, projectId } = location.state || {};
  const [sessionStatus, setSessionStatus] = useState<'waiting' | 'active' | 'completed'>('waiting');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

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
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Participant Info */}
          <div className="lg:col-span-1">
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
                    <Badge variant="outline" className="text-status-success border-status-success">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Katıldı
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Session Content */}
          <div className="lg:col-span-2">
            {sessionStatus === 'waiting' ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <Clock className="w-12 h-12 text-brand-primary mx-auto mb-4 animate-pulse" />
                    <h3 className="text-lg font-semibold text-text-primary mb-2">
                      Araştırmacı Bağlanıyor...
                    </h3>
                    <p className="text-text-secondary">
                      Lütfen bekleyin, araştırmacı kısa süre içinde sizinle iletişime geçecek.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MessageSquare className="w-5 h-5" />
                    <span>Görüşme Alanı</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-surface rounded-lg p-6 mb-4">
                    <div className="text-center py-8">
                      <Video className="w-16 h-16 text-brand-primary mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-text-primary mb-2">
                        Video Görüşme Aktif
                      </h3>
                      <p className="text-text-secondary mb-6">
                        Araştırmacı ile görüşmeniz devam ediyor. Soruları yanıtlamak için 
                        mikrofon ve kameranızı kullanabilirsiniz.
                      </p>
                      
                      <div className="flex items-center justify-center space-x-4 text-sm">
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 bg-status-success rounded-full"></div>
                          <span className="text-text-secondary">Mikrofon aktif</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 bg-status-success rounded-full"></div>
                          <span className="text-text-secondary">Kamera aktif</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-center">
                    <Button 
                      onClick={handleCompleteSession}
                      className="bg-brand-primary hover:bg-brand-primary-hover text-white"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Görüşmeyi Tamamla
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default StudySession;