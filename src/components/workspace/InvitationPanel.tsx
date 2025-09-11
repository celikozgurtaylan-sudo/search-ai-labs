import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Mail, Users, Send, Link2, Copy, Trash2, RefreshCw, Clock, CheckCircle, XCircle } from "lucide-react";
import { participantService, StudyParticipant } from "@/services/participantService";
import { toast } from "sonner";

interface InvitationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParticipantsUpdate: (participants: StudyParticipant[]) => void;
  projectId: string;
}

const InvitationPanel = ({
  open,
  onOpenChange,
  onParticipantsUpdate,
  projectId
}: InvitationPanelProps) => {
  const [participants, setParticipants] = useState<StudyParticipant[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (open && projectId) {
      loadParticipants();
    }
  }, [open, projectId]);

  const loadParticipants = async () => {
    try {
      setIsLoading(true);
      const data = await participantService.getProjectParticipants(projectId);
      setParticipants(data);
      onParticipantsUpdate(data);
    } catch (error) {
      console.error('Failed to load participants:', error);
      toast.error("Katılımcılar yüklenirken hata oluştu");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddParticipant = async () => {
    if (!newEmail.trim()) {
      toast.error("E-posta adresi gereklidir");
      return;
    }

    // Check if email already exists
    const emailExists = participants.some(p => p.email.toLowerCase() === newEmail.toLowerCase());
    if (emailExists) {
      toast.error("Bu e-posta adresi zaten davet edilmiş");
      return;
    }

    try {
      setIsSending(true);
      
      const participant = await participantService.createParticipant({
        project_id: projectId,
        email: newEmail.trim(),
        name: newName.trim() || undefined,
        status: 'invited',
        invitation_token: participantService.generateInvitationToken(),
        token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      });

      // TODO: Send email invitation here
      
      setParticipants(prev => [participant, ...prev]);
      onParticipantsUpdate([participant, ...participants]);
      
      setNewEmail("");
      setNewName("");
      
      toast.success("Katılımcı başarıyla davet edildi");
    } catch (error) {
      console.error('Failed to add participant:', error);
      toast.error("Katılımcı davet edilirken hata oluştu");
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteParticipant = async (id: string) => {
    try {
      await participantService.deleteParticipant(id);
      const updatedParticipants = participants.filter(p => p.id !== id);
      setParticipants(updatedParticipants);
      onParticipantsUpdate(updatedParticipants);
      toast.success("Katılımcı silindi");
    } catch (error) {
      console.error('Failed to delete participant:', error);
      toast.error("Katılımcı silinirken hata oluştu");
    }
  };

  const handleCopyInvitationLink = (token: string) => {
    const link = `${window.location.origin}/participate/${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Davet linki kopyalandı");
  };

  const getStatusBadge = (status: StudyParticipant['status']) => {
    switch (status) {
      case 'invited':
        return <Badge variant="outline" className="text-amber-600 border-amber-600"><Clock className="w-3 h-3 mr-1" />Davet Edildi</Badge>;
      case 'joined':
        return <Badge variant="outline" className="text-blue-600 border-blue-600"><CheckCircle className="w-3 h-3 mr-1" />Katıldı</Badge>;
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="w-3 h-3 mr-1" />Tamamlandı</Badge>;
      case 'declined':
        return <Badge variant="outline" className="text-red-600 border-red-600"><XCircle className="w-3 h-3 mr-1" />Reddetti</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[800px] sm:max-w-[800px] p-0">
        <div className="h-full flex flex-col">
          {/* Header */}
          <SheetHeader className="p-6 border-b border-border-light">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-xl font-semibold text-text-primary flex items-center space-x-2">
                  <Mail className="w-5 h-5" />
                  <span>Katılımcı Davet Et</span>
                </SheetTitle>
                <SheetDescription className="text-text-secondary mt-1">
                  E-posta ile katılımcı davet edin veya direkt link paylaşın
                </SheetDescription>
              </div>
              
              <div className="flex items-center space-x-3">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={loadParticipants}
                  disabled={isLoading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Yenile
                </Button>
              </div>
            </div>
          </SheetHeader>

          {/* Add New Participant Form */}
          <div className="p-6 border-b border-border-light bg-surface">
            <h3 className="text-sm font-medium text-text-secondary mb-4 flex items-center">
              <Users className="w-4 h-4 mr-2" />
              Yeni Katılımcı Ekle
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-posta Adresi *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="ornek@email.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddParticipant();
                      }
                    }}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="name">İsim (Opsiyonel)</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Katılımcının ismi"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddParticipant();
                      }
                    }}
                  />
                </div>
              </div>
              
              <Button 
                onClick={handleAddParticipant}
                disabled={!newEmail.trim() || isSending}
                className="w-full bg-brand-primary hover:bg-brand-primary-hover text-white"
              >
                <Send className="w-4 h-4 mr-2" />
                {isSending ? "Davet Gönderiliyor..." : "Davet Et"}
              </Button>
            </div>
          </div>

          {/* Participants List */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">
                Davet Edilen Katılımcılar ({participants.length})
              </h3>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-text-secondary" />
              </div>
            ) : participants.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-text-primary mb-2">Henüz katılımcı yok</h3>
                <p className="text-text-secondary max-w-md mx-auto">
                  Yukarıdaki formu kullanarak katılımcıları e-posta ile davet edebilirsiniz.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {participants.map(participant => (
                  <Card key={participant.id} className="hover:border-brand-primary transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className="w-10 h-10 bg-brand-primary-light rounded-full flex items-center justify-center">
                            <Mail className="w-4 h-4 text-brand-primary" />
                          </div>
                          
                          <div>
                            <CardTitle className="text-base font-semibold text-text-primary">
                              {participant.name || participant.email}
                            </CardTitle>
                            {participant.name && (
                              <p className="text-sm text-text-secondary">{participant.email}</p>
                            )}
                            <div className="flex items-center space-x-2 mt-2">
                              {getStatusBadge(participant.status)}
                              <span className="text-xs text-text-muted">
                                {new Date(participant.invited_at || '').toLocaleDateString('tr-TR')} tarihinde davet edildi
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyInvitationLink(participant.invitation_token)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => participant.id && handleDeleteParticipant(participant.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border-light p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-text-secondary">
                {participants.length} katılımcı davet edildi • {participants.filter(p => p.status === 'joined').length} katıldı
              </div>
              
              <div className="flex items-center space-x-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Kapat
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default InvitationPanel;