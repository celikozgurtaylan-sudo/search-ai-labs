import { Mail } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ParticipantManager from "@/components/workspace/ParticipantManager";
import { StudyParticipant, StudySession } from "@/services/participantService";

interface InvitationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParticipantsUpdate: (participants: StudyParticipant[]) => void;
  projectId: string;
  projectTitle?: string;
  currentQuestionSetVersionId?: string | null;
  currentQuestionSetVersionNumber?: number | null;
  questionSetUpdatedAt?: string | null;
  sessions?: StudySession[];
}

const InvitationPanel = ({
  open,
  onOpenChange,
  onParticipantsUpdate,
  projectId,
  projectTitle,
  currentQuestionSetVersionId,
  currentQuestionSetVersionNumber,
  questionSetUpdatedAt,
  sessions = [],
}: InvitationPanelProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[800px] sm:max-w-[800px] p-0">
        <div className="h-full flex flex-col">
          <SheetHeader className="p-6 border-b border-border-light">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              <div>
                <SheetTitle className="text-xl font-semibold text-text-primary">Katılımcı Davet Et</SheetTitle>
                <SheetDescription className="text-text-secondary mt-1">
                  E-posta ile davet gönderin veya direkt link paylaşın.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6">
            <ParticipantManager
              active={open}
              variant="sheet"
              projectId={projectId}
              projectTitle={projectTitle}
              currentQuestionSetVersionId={currentQuestionSetVersionId}
              currentQuestionSetVersionNumber={currentQuestionSetVersionNumber}
              questionSetUpdatedAt={questionSetUpdatedAt}
              sessions={sessions}
              onParticipantsUpdate={onParticipantsUpdate}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default InvitationPanel;
