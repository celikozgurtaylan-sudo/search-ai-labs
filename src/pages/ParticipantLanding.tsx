import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { participantService, StudyParticipant } from "@/services/participantService";
import { CheckCircle, Clock, User, Mail, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const ParticipantLanding = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [participant, setParticipant] = useState<StudyParticipant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [participantName, setParticipantName] = useState("");

  useEffect(() => {
    if (token) {
      loadParticipant();
    }
  }, [token]);

  const loadParticipant = async () => {
    try {
      setLoading(true);
      const data = await participantService.getParticipantByToken(token!);
      
      if (!data) {
        setError("Geçersiz veya süresi dolmuş davet linki");
        return;
      }
      
      if (data.status === 'declined') {
        setError("Bu davet reddedilmiş");
        return;
      }

      setParticipant(data);
      setParticipantName(data.name || "");
    } catch (err) {
      console.error('Failed to load participant:', err);
      setError("Katılımcı bilgileri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinStudy = async () => {
    if (!participant?.invitation_token || !consentGiven) return;

    try {
      setJoining(true);
      
      // Update participant status to joined
      await participantService.updateParticipantStatusByToken(participant.invitation_token, 'joined');
      
      // Create a session record in the database
      const session = await participantService.createSessionForParticipant(
        participant.project_id,
        participant.id!
      );
      
      // Redirect to the study interface with the database session token
      navigate(`/study-session/${session.session_token}`);
      
    } catch (error) {
      console.error('Failed to join study:', error);
      toast.error("Çalışmaya katılırken hata oluştu");
    } finally {
      setJoining(false);
    }
  };

  const handleDeclineStudy = async () => {
    if (!participant?.invitation_token) return;

    try {
      await participantService.updateParticipantStatusByToken(participant.invitation_token, 'declined');
      toast.success("Davet reddedildi");
      
      // Show decline message
      setError("Daveti reddettiğiniz için teşekkürler. Bu pencereyi kapatabilirsiniz.");
      
    } catch (error) {
      console.error('Failed to decline study:', error);
      toast.error("Davet reddedilirken hata oluştu");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center">
          <Clock className="w-8 h-8 animate-spin text-brand-primary mx-auto mb-4" />
          <p className="text-text-secondary">Davet bilgileri yükleniyor...</p>
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

  if (!participant) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-text-primary mb-2">Davet Bulunamadı</h2>
            <p className="text-text-secondary">Bu davet linki geçersiz veya süresi dolmuş olabilir.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-4">
            Kullanıcı Araştırması Daveti
          </h1>
          <p className="text-text-secondary text-lg">
            Bir kullanıcı araştırması çalışmasına davet edildiniz. Katılımınız tamamen gönüllülük esasına dayalıdır.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>Katılımcı Bilgileri</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Participant Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">E-posta Adresi</Label>
                <div className="flex items-center space-x-2 mt-1">
                  <Mail className="w-4 h-4 text-text-secondary" />
                  <span className="text-text-primary">{participant.email}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="name">İsim (Opsiyonel)</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Adınız ve soyadınız"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-text-muted mt-1">
                  İsminizi paylaşmak opsiyoneldir ve sadece araştırma sürecinde sizinle iletişim kurmak için kullanılacaktır.
                </p>
              </div>
            </div>

            {/* Consent */}
            <div className="space-y-4 p-4 bg-surface rounded-lg">
              <h3 className="font-medium text-text-primary">Onay ve Gizlilik</h3>
              
              <div className="space-y-3 text-sm text-text-secondary">
                <p>• Bu araştırmaya katılımınız tamamen gönüllüdür</p>
                <p>• İstediğiniz zaman çalışmadan çıkabilirsiniz</p>
                <p>• Verileriniz güvenli şekilde saklanacak ve sadece araştırma amaçlı kullanılacaktır</p>
                <p>• Kimlik bilgileriniz gizli tutulacak ve üçüncü taraflarla paylaşılmayacaktır</p>
                <p>• Araştırma süresi yaklaşık 15-30 dakika sürmektedir</p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="consent" 
                  checked={consentGiven}
                  onCheckedChange={(checked) => setConsentGiven(!!checked)}
                />
                <Label htmlFor="consent" className="text-sm">
                  Yukarıdaki koşulları okudum, anladım ve araştırmaya katılmayı kabul ediyorum
                </Label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center space-x-4 pt-4">
              <Button
                variant="outline"
                onClick={handleDeclineStudy}
                disabled={joining}
              >
                Davet Ret
              </Button>
              
              <Button
                onClick={handleJoinStudy}
                disabled={!consentGiven || joining}
                className="bg-brand-primary hover:bg-brand-primary-hover text-white"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {joining ? "Katılınıyor..." : "Araştırmaya Katıl"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ParticipantLanding;