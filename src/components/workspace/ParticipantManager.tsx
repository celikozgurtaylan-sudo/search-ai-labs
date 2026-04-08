import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { participantService, StudyParticipant, StudySession } from "@/services/participantService";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, Clock, Copy, Link2, Mail, RefreshCw, Send, Trash2, UserPlus, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

interface ParticipantManagerProps {
  active?: boolean;
  projectId: string;
  projectTitle?: string;
  currentQuestionSetVersionId?: string | null;
  currentQuestionSetVersionNumber?: number | null;
  questionSetUpdatedAt?: string | null;
  sessions?: StudySession[];
  variant?: "inline" | "sheet";
  onParticipantsUpdate: (participants: StudyParticipant[]) => void;
}

const ParticipantManager = ({
  active = true,
  projectId,
  projectTitle = "Kullanıcı Deneyimi Araştırması",
  currentQuestionSetVersionId = null,
  currentQuestionSetVersionNumber = null,
  questionSetUpdatedAt = null,
  sessions = [],
  variant = "inline",
  onParticipantsUpdate,
}: ParticipantManagerProps) => {
  const [participants, setParticipants] = useState<StudyParticipant[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [resendingEmails, setResendingEmails] = useState<Set<string>>(new Set());

  const sessionsByParticipantId = useMemo(() => {
    const entries = new Map<string, StudySession[]>();

    sessions.forEach((session) => {
      if (!session.participant_id) return;
      const nextSessions = entries.get(session.participant_id) ?? [];
      nextSessions.push(session);
      entries.set(session.participant_id, nextSessions);
    });

    return entries;
  }, [sessions]);

  useEffect(() => {
    if (!active || !projectId) return;
    void loadParticipants();
  }, [active, projectId]);

  const loadParticipants = async () => {
    try {
      setIsLoading(true);
      const data = await participantService.getProjectParticipants(projectId);
      setParticipants(data);
      onParticipantsUpdate(data);
    } catch (error) {
      console.error("Failed to load participants:", error);
      toast.error("Katılımcılar yüklenirken hata oluştu");
    } finally {
      setIsLoading(false);
    }
  };

  const getInvitationBaseUrl = (useCurrentOrigin = false) => {
    if (useCurrentOrigin && typeof window !== "undefined") {
      return window.location.origin.replace(/\/$/, "");
    }

    const configuredUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
    return (configuredUrl || "https://beta.searcho.online").replace(/\/$/, "");
  };

  const getParticipantStatus = (participant: StudyParticipant) => {
    const participantSessions = participant.id
      ? sessionsByParticipantId.get(participant.id) ?? []
      : [];
    const latestSession = participantSessions
      .slice()
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())[0];

    if (participant.status === "declined") {
      return {
        label: "Reddetti",
        badgeClassName: "text-red-600 border-red-600",
        icon: <XCircle className="w-3 h-3 mr-1" />,
      };
    }

    if (participant.status === "completed" || latestSession?.status === "completed" || latestSession?.ended_at) {
      return {
        label: "Tamamlandı",
        badgeClassName: "text-green-600 border-green-600",
        icon: <CheckCircle className="w-3 h-3 mr-1" />,
      };
    }

    if (latestSession?.status === "active" || latestSession?.started_at) {
      return {
        label: "Görüşmede",
        badgeClassName: "text-brand-primary border-brand-primary",
        icon: <RefreshCw className="w-3 h-3 mr-1 animate-spin" />,
      };
    }

    if (participant.status === "joined" || latestSession?.status === "scheduled") {
      return {
        label: "Katıldı",
        badgeClassName: "text-blue-600 border-blue-600",
        icon: <CheckCircle className="w-3 h-3 mr-1" />,
      };
    }

    return {
      label: "Davet Edildi",
      badgeClassName: "text-amber-600 border-amber-600",
      icon: <Clock className="w-3 h-3 mr-1" />,
    };
  };

  const handleCopyInvitationLink = (token: string, useCurrentOrigin = false) => {
    const link = `${getInvitationBaseUrl(useCurrentOrigin)}/join/research/${token}`;
    navigator.clipboard.writeText(link);
    toast.success(useCurrentOrigin ? "Test davet linki kopyalandı" : "Katılımcı davet linki kopyalandı");
  };

  const handleOpenTestLink = (token: string) => {
    const link = `${getInvitationBaseUrl(true)}/join/research/${token}`;
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const handleAddParticipant = async () => {
    if (!newEmail.trim()) {
      toast.error("E-posta adresi gereklidir");
      return;
    }

    const emailExists = participants.some((participant) => participant.email.toLowerCase() === newEmail.trim().toLowerCase());
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
        status: "invited",
        invitation_token: participantService.generateInvitationToken(),
        token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          questionSetVersionId: currentQuestionSetVersionId,
          questionSetVersionNumber: currentQuestionSetVersionNumber,
          questionSetAssignedAt: new Date().toISOString(),
        },
      });

      try {
        const { error: emailError } = await supabase.functions.invoke("send-invitation-email", {
          body: {
            participantEmail: participant.email,
            participantName: participant.name,
            invitationToken: participant.invitation_token,
            projectTitle,
            expiresAt: participant.token_expires_at,
          },
        });

        if (emailError) {
          console.error("Email sending failed:", emailError);
          toast.error("Katılımcı oluşturuldu ancak e-posta gönderilemedi");
        } else {
          toast.success("Katılımcı davet edildi ve e-posta gönderildi");
        }
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        toast.error("Katılımcı oluşturuldu ancak e-posta gönderilemedi");
      }

      const nextParticipants = [participant, ...participants];
      setParticipants(nextParticipants);
      onParticipantsUpdate(nextParticipants);
      setNewEmail("");
      setNewName("");
    } catch (error) {
      console.error("Failed to add participant:", error);
      toast.error("Katılımcı davet edilirken hata oluştu");
    } finally {
      setIsSending(false);
    }
  };

  const handleResendEmail = async (participant: StudyParticipant) => {
    if (!participant.id) return;

    setResendingEmails((prev) => new Set([...prev, participant.id!]));

    try {
      const { error: emailError } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          participantEmail: participant.email,
          participantName: participant.name,
          invitationToken: participant.invitation_token,
          projectTitle,
          expiresAt: participant.token_expires_at,
        },
      });

      if (emailError) {
        console.error("Email resend failed:", emailError);
        toast.error("E-posta yeniden gönderilemedi");
      } else {
        toast.success("Davet e-postası yeniden gönderildi");
      }
    } catch (error) {
      console.error("Email resend failed:", error);
      toast.error("E-posta yeniden gönderilemedi");
    } finally {
      setResendingEmails((prev) => {
        const next = new Set(prev);
        next.delete(participant.id!);
        return next;
      });
    }
  };

  const handleDeleteParticipant = async (id: string) => {
    try {
      await participantService.deleteParticipant(id);
      const nextParticipants = participants.filter((participant) => participant.id !== id);
      setParticipants(nextParticipants);
      onParticipantsUpdate(nextParticipants);
      toast.success("Katılımcı silindi");
    } catch (error) {
      console.error("Failed to delete participant:", error);
      toast.error("Katılımcı silinirken hata oluştu");
    }
  };

  const currentVersionLabel = currentQuestionSetVersionNumber ? `v${currentQuestionSetVersionNumber}` : null;
  const hasForwardLookingChangeNotice = Boolean(currentQuestionSetVersionNumber && currentQuestionSetVersionNumber > 1 && questionSetUpdatedAt);

  return (
    <div className="space-y-6">
      <Card className={variant === "inline" ? "p-6" : "border-0 shadow-none"}>
        <div className="flex flex-col gap-3 border-b border-border-light pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-primary" />
              <h3 className="text-base font-semibold text-text-primary">Katılımcı Yönetimi</h3>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              Yeni davet gönder, mevcut davetleri yönet ve süreci buradan takip et.
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={loadParticipants} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-border-light bg-surface/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-brand-primary/40 text-brand-primary">
                {currentVersionLabel ? `${currentVersionLabel} yeni davetlerde kullanılacak` : "Varsayılan soru seti"}
              </Badge>
              {hasForwardLookingChangeNotice ? (
                <span className="text-xs text-text-secondary">
                  Sorular {new Date(questionSetUpdatedAt!).toLocaleString("tr-TR")} tarihinde güncellendi. Bu andan sonra göndereceğiniz yeni davetler yeni soru setini kullanır.
                </span>
              ) : (
                <span className="text-xs text-text-secondary">
                  Yeni davetler mevcut soru seti ile atanır. Mevcut davetler ve aktif oturumlar etkilenmez.
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4 rounded-2xl border border-border-light bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                <UserPlus className="w-4 h-4" />
                Yeni Katılımcı Ekle
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${variant}-participant-email`}>E-posta Adresi *</Label>
                  <Input
                    id={`${variant}-participant-email`}
                    type="email"
                    placeholder="ornek@email.com"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleAddParticipant();
                      }
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${variant}-participant-name`}>İsim</Label>
                  <Input
                    id={`${variant}-participant-name`}
                    placeholder="Katılımcı adı"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleAddParticipant();
                      }
                    }}
                  />
                </div>
              </div>

              <Button onClick={() => void handleAddParticipant()} disabled={isSending} className="bg-brand-primary text-white hover:bg-brand-primary-hover">
                {isSending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Davet Et
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1">
              <div className="rounded-2xl border border-border-light bg-surface/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Toplam</p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">{participants.length}</p>
              </div>
              <div className="rounded-2xl border border-border-light bg-surface/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Katıldı</p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">
                  {participants.filter((participant) => participant.status === "joined" || participant.status === "completed").length}
                </p>
              </div>
              <div className="rounded-2xl border border-border-light bg-surface/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Tamamlandı</p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">
                  {participants.filter((participant) => participant.status === "completed").length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className={variant === "inline" ? "p-6" : "border-0 shadow-none"}>
        <div className="flex items-center justify-between gap-3 border-b border-border-light pb-4">
          <div>
            <h4 className="text-sm font-medium text-text-primary">Davet Edilen Katılımcılar ({participants.length})</h4>
            <p className="mt-1 text-xs text-text-secondary">
              Her katılımcı kendi davet edildiği soru seti versiyonuyla eşleşir.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-border-light bg-surface/50 p-5 text-sm text-text-secondary">
              Katılımcılar yükleniyor...
            </div>
          ) : participants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-light bg-surface/50 p-5 text-sm text-text-secondary">
              Henüz katılımcı yok. İlk daveti gönderdiğinizde burada görünecek.
            </div>
          ) : (
            participants.map((participant) => {
              const status = getParticipantStatus(participant);
              const versionNumber = Number(participant.metadata?.questionSetVersionNumber ?? 1);
              const isCurrentVersion = currentQuestionSetVersionNumber ? versionNumber === currentQuestionSetVersionNumber : true;

              return (
                <Card key={participant.id} className="border-border-light p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-text-primary">{participant.name || participant.email}</p>
                        <Badge variant="outline" className={status.badgeClassName}>
                          {status.icon}
                          {status.label}
                        </Badge>
                        <Badge variant="outline" className="border-brand-primary/30 text-brand-primary">
                          v{versionNumber}
                        </Badge>
                        {!isCurrentVersion ? (
                          <Badge variant="outline" className="border-text-muted/40 text-text-secondary">
                            Eski Soru Seti
                          </Badge>
                        ) : null}
                      </div>

                      <div className="space-y-1 text-xs text-text-secondary">
                        <p>{participant.email}</p>
                        <p>
                          {new Date(participant.invited_at || participant.created_at || Date.now()).toLocaleString("tr-TR")} tarihinde davet edildi
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleCopyInvitationLink(participant.invitation_token)}>
                        <Copy className="w-3 h-3 mr-1" />
                        Link Kopyala
                      </Button>
                      {import.meta.env.DEV ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleCopyInvitationLink(participant.invitation_token, true)}>
                            <Link2 className="w-3 h-3 mr-1" />
                            Test Linki
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleOpenTestLink(participant.invitation_token)}>
                            <Mail className="w-3 h-3 mr-1" />
                            Aç
                          </Button>
                        </>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleResendEmail(participant)}
                        disabled={resendingEmails.has(participant.id!)}
                      >
                        {resendingEmails.has(participant.id!) ? (
                          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3 mr-1" />
                        )}
                        Yeniden Gönder
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => participant.id && void handleDeleteParticipant(participant.id)}>
                        <Trash2 className="w-3 h-3 mr-1" />
                        Sil
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
};

export default ParticipantManager;
