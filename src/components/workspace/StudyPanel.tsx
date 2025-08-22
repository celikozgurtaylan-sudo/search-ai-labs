import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { 
  Video, 
  Edit3, 
  Plus, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  Circle,
  User,
  PlayCircle,
  BarChart3,
  Camera,
  Monitor
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface StudyPanelProps {
  discussionGuide: any;
  participants: any[];
  currentStep: 'guide' | 'recruit' | 'run' | 'analyze';
  onGuideUpdate: (guide: any) => void;
}

const StudyPanel = ({ discussionGuide, participants, currentStep, onGuideUpdate }: StudyPanelProps) => {
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isScreenRecording, setIsScreenRecording] = useState(false);
  const [isCameraRecording, setIsCameraRecording] = useState(false);

  const handleEditQuestion = (questionId: string, currentValue: string) => {
    setEditingQuestion(questionId);
    setEditValue(currentValue);
  };

  const handleSaveQuestion = (sectionId: string, questionIndex: number) => {
    if (!discussionGuide) return;

    const updatedGuide = {
      ...discussionGuide,
      sections: discussionGuide.sections.map((section: any) => {
        if (section.id === sectionId) {
          const updatedQuestions = [...section.questions];
          updatedQuestions[questionIndex] = editValue;
          return {
            ...section,
            questions: updatedQuestions
          };
        }
        return section;
      })
    };

    onGuideUpdate(updatedGuide);
    setEditingQuestion(null);
    setEditValue("");
  };

  const handleAddQuestion = (sectionId: string) => {
    if (!discussionGuide) return;

    const newQuestion = "Yeni soru - düzenlemek için tıklayın";
    const updatedGuide = {
      ...discussionGuide,
      sections: discussionGuide.sections.map((section: any) => {
        if (section.id === sectionId) {
          return {
            ...section,
            questions: [...section.questions, newQuestion]
          };
        }
        return section;
      })
    };

    onGuideUpdate(updatedGuide);
  };

  const getInterviewStatus = (participantId: string) => {
    // Görüşme ilerlemesini simüle et
    const statuses = ['Sırada', 'Devam Ediyor', 'Tamamlandı'];
    const hash = participantId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return statuses[hash % statuses.length];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Tamamlandı':
        return <CheckCircle2 className="w-4 h-4 text-status-success" />;
      case 'Devam Ediyor':
        return <PlayCircle className="w-4 h-4 text-brand-primary" />;
      default:
        return <Circle className="w-4 h-4 text-text-muted" />;
    }
  };

  const renderAnalysisView = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">Ana Temalar</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <h4 className="font-medium text-text-primary mb-2">Kullanıcı Deneyimi</h4>
            <p className="text-sm text-text-secondary">%86 pozitif görüş</p>
            <div className="mt-2">
              <Badge variant="secondary" className="text-xs">Navigasyon</Badge>
              <Badge variant="secondary" className="text-xs ml-2">Görsel Tasarım</Badge>
            </div>
          </Card>
          <Card className="p-4">
            <h4 className="font-medium text-text-primary mb-2">Özellik İstekleri</h4>
            <p className="text-sm text-text-secondary">12 benzersiz öneri</p>
            <div className="mt-2">
              <Badge variant="secondary" className="text-xs">Mobil Uygulama</Badge>
              <Badge variant="secondary" className="text-xs ml-2">Entegrasyon</Badge>
            </div>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">Öne Çıkan Alıntılar</h3>
        <div className="space-y-3">
          <Card className="p-4">
            <p className="text-sm text-text-primary italic">"Bu gerçekten araştırma sürecimizi kolaylaştırabilir"</p>
            <p className="text-xs text-text-secondary mt-2">- Sarah M., Ürün Müdürü</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-text-primary italic">"AI analiz özelliği etkileyici"</p>
            <p className="text-xs text-text-secondary mt-2">- Mike D., UX Araştırmacısı</p>
          </Card>
        </div>
      </div>

      <div className="flex space-x-3">
        <Button variant="outline" className="flex items-center space-x-2">
          <BarChart3 className="w-4 h-4" />
          <span>PDF Dışa Aktar</span>
        </Button>
        <Button variant="outline" className="flex items-center space-x-2">
          <BarChart3 className="w-4 h-4" />
          <span>CSV Dışa Aktar</span>
        </Button>
      </div>
    </div>
  );

  if (!discussionGuide) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-brand-primary-light rounded-lg flex items-center justify-center mx-auto mb-3">
            <Video className="w-6 h-6 text-brand-primary" />
          </div>
          <p className="text-text-secondary">Tartışma kılavuzu oluşturuluyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Study Header */}
      <div className="border-b border-border-light p-6 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <h2 className="text-lg font-semibold text-text-primary">{discussionGuide.title}</h2>
          
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            {/* Screen Recording Toggle */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <Monitor className={`w-4 h-4 ${isScreenRecording ? 'text-status-success' : 'text-text-muted'}`} />
                <span className="text-sm font-medium text-text-primary">Ekran Kaydı</span>
              </div>
              <Switch 
                checked={isScreenRecording} 
                onCheckedChange={setIsScreenRecording}
                className="data-[state=checked]:bg-status-success"
              />
            </div>
            
            {/* Camera Recording Toggle */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <Camera className={`w-4 h-4 ${isCameraRecording ? 'text-status-success' : 'text-text-muted'}`} />
                <span className="text-sm font-medium text-text-primary">Kamera</span>
              </div>
              <Switch 
                checked={isCameraRecording} 
                onCheckedChange={setIsCameraRecording}
                className="data-[state=checked]:bg-status-success"
              />
            </div>
          </div>
        </div>
        
        {currentStep === 'run' && participants.length > 0 && (
          <div className="text-sm text-text-secondary">
            {participants.filter(p => getInterviewStatus(p.id) === 'Tamamlandı').length} / {participants.length} görüşme tamamlandı
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {currentStep === 'analyze' ? renderAnalysisView() : (
          <div className="space-y-6">
            {/* Discussion Guide Sections */}
            {discussionGuide.sections.map((section: any) => (
              <Card key={section.id} className="p-6">
                <CardHeader className="p-0 mb-4">
                  <CardTitle className="text-base font-semibold text-text-primary">
                    {section.title}
                  </CardTitle>
                </CardHeader>
                
                <CardContent className="p-0 space-y-3">
                  {section.questions.map((question: string, index: number) => (
                    <div key={`${section.id}-${index}`} className="group flex items-start space-x-2">
                      <span className="text-xs text-text-muted mt-2 w-5">
                        {index + 1}.
                      </span>
                      
                      <div className="flex-1">
                        {editingQuestion === `${section.id}-${index}` ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="text-sm"
                                autoFocus
                              />
                              <div className="flex space-x-2">
                                <Button 
                                  size="sm" 
                                  onClick={() => handleSaveQuestion(section.id, index)}
                                >
                                  Kaydet
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => setEditingQuestion(null)}
                                >
                                  İptal
                                </Button>
                              </div>
                            </div>
                        ) : (
                          <div 
                            className="text-sm text-text-primary cursor-text hover:bg-surface rounded p-2 -m-2 transition-colors"
                            onClick={() => handleEditQuestion(`${section.id}-${index}`, question)}
                          >
                            {question}
                          </div>
                        )}
                      </div>
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleEditQuestion(`${section.id}-${index}`, question)}
                      >
                        <Edit3 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleAddQuestion(section.id)}
                    className="flex items-center space-x-1 text-text-secondary hover:text-text-primary"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Soru ekle</span>
                  </Button>
                </CardContent>
              </Card>
            ))}

            {/* Participants (when recruited) */}
            {participants.length > 0 && currentStep !== 'guide' && (
              <Card className="p-6">
                <CardHeader className="p-0 mb-4">
                  <CardTitle className="text-base font-semibold text-text-primary flex items-center space-x-2">
                    <User className="w-4 h-4" />
                    <span>Katılımcılar ({participants.length})</span>
                  </CardTitle>
                </CardHeader>
                
                <CardContent className="p-0 space-y-3">
                  {participants.map((participant) => {
                    const status = getInterviewStatus(participant.id);
                    return (
                      <div key={participant.id} className="flex items-center justify-between p-3 bg-surface rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-brand-primary-light rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-brand-primary">
                              {participant.name.split(' ').map((n: string) => n[0]).join('')}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-text-primary">{participant.name}</p>
                            <p className="text-xs text-text-secondary">{participant.role}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(status)}
                          <span className="text-xs text-text-secondary">{status}</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudyPanel;