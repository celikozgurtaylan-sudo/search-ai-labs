import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Plus, Edit3, Check, X, FileText, Download, Share, CheckCircle2, Clock, Circle, PlayCircle, BarChart3, Camera, Monitor, Loader2, TrendingUp, AlertTriangle, Users, Video, User, Sparkles, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import TypewriterText from "@/components/ui/typewriter-text";
interface StudyPanelProps {
  discussionGuide: any;
  participants: any[]; // Will work with both old and new participant structures
  currentStep: 'guide' | 'recruit' | 'starting' | 'run' | 'analyze';
  onGuideUpdate: (guide: any) => void;
  chatMessages?: any[];
}
const StudyPanel = ({
  discussionGuide,
  participants,
  currentStep,
  onGuideUpdate,
  chatMessages = []
}: StudyPanelProps) => {
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isScreenRecording, setIsScreenRecording] = useState(false);
  const [isCameraRecording, setIsCameraRecording] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState<{
    [key: string]: boolean;
  }>({});
  const [generatingQuestions, setGeneratingQuestions] = useState<{
    [key: string]: boolean;
  }>({});
  const [typewriterQuestions, setTypewriterQuestions] = useState<{
    [key: string]: string[];
  }>({});
  const [showTitleTypewriter, setShowTitleTypewriter] = useState(true);
  const [showSectionTypewriters, setShowSectionTypewriters] = useState<{
    [key: string]: boolean;
  }>({});
  const [showAnalysisTypewriter, setShowAnalysisTypewriter] = useState(false);
  const [showQuestionTypewriters, setShowQuestionTypewriters] = useState<{
    [key: string]: boolean;
  }>({});
  const [loadingMessages] = useState(["AI soruları oluşturuluyor...", "Katılımcı deneyimini analiz ediyor...", "En iyi soruları seçiyor...", "Araştırma planını optimize ediyor..."]);
  const [currentLoadingIndex, setCurrentLoadingIndex] = useState(0);
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

  // Enhanced loading messages with typewriter effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLoadingIndex(prev => (prev + 1) % loadingMessages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [loadingMessages.length]);

  // Initialize section typewriters when guide is loaded
  useEffect(() => {
    if (discussionGuide?.sections && Object.keys(showSectionTypewriters).length === 0) {
      const initialSections: {
        [key: string]: boolean;
      } = {};
      discussionGuide.sections.forEach((section: any, index: number) => {
        initialSections[section.id] = true;
      });
      setShowSectionTypewriters(initialSections);
    }
  }, [discussionGuide, showSectionTypewriters]);

  // Initialize question typewriters when guide is loaded - don't pre-initialize questions
  useEffect(() => {
    if (discussionGuide?.sections && Object.keys(showQuestionTypewriters).length === 0) {
      // Don't initialize questions - let them be undefined until typewriter starts

      // Start showing questions section by section after a 2-second delay
      setTimeout(() => {
        let sectionStartDelay = 0;
        discussionGuide.sections.forEach((section: any, sectionIndex: number) => {
          section.questions.forEach((question: string, questionIndex: number) => {
            const questionKey = `${section.id}-${questionIndex}`;
            const questionDelay = sectionStartDelay + questionIndex * 800;
            setTimeout(() => {
              setShowQuestionTypewriters(prev => ({
                ...prev,
                [questionKey]: true
              }));
            }, questionDelay);
          });

          // Next section starts after all questions in current section finish
          // Add extra 400ms buffer between sections
          sectionStartDelay += section.questions.length * 800 + 400;
        });
      }, 2000); // 2-second base delay
    }
  }, [discussionGuide, showQuestionTypewriters]);

  // Show analysis typewriter when entering analyze step
  useEffect(() => {
    if (currentStep === 'analyze' && !showAnalysisTypewriter) {
      setShowAnalysisTypewriter(true);
    }
  }, [currentStep, showAnalysisTypewriter]);
  const generateAIQuestions = async (sectionId: string, sectionTitle: string) => {
    setGeneratingQuestions(prev => ({
      ...prev,
      [sectionId]: true
    }));
    
    setLoadingQuestions(prev => ({
      ...prev,
      [sectionId]: true
    }));

    try {
      // Get current questions for this section
      const currentSection = discussionGuide?.sections?.find((s: any) => s.id === sectionId);
      const existingQuestions = currentSection?.questions || [];

      // Get the latest user message from chat as project description
      const userMessages = chatMessages.filter(msg => msg.type === 'user');
      const latestUserInput = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

      // Fallback to stored project data if no chat messages
      const projectDescription = latestUserInput || (localStorage.getItem('searchai-project') ? JSON.parse(localStorage.getItem('searchai-project')!).description : 'Kullanıcı deneyimi araştırması');

      console.log('Generating questions for:', { sectionTitle, sectionId, projectDescription });

      const { data, error } = await supabase.functions.invoke('generate-questions', {
        body: {
          sectionTitle,
          sectionId,
          projectDescription,
          existingQuestions,
          validateProject: false
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        alert(`Sorular oluşturulurken hata oluştu: ${error.message}`);
        throw error;
      }

      console.log('Generated questions response:', data);

      // Check if validation failed
      if (data?.needsElaboration) {
        alert(`Lütfen daha detaylı bir araştırma projesi açıklaması yapın. ${data.reason || ''}`);
        return;
      }

      const questions = data?.questions || [];
      
      if (questions.length === 0) {
        alert('Soru oluşturulamadı. Lütfen tekrar deneyin.');
        return;
      }

      console.log('Adding questions:', questions);

      // Set up typewriter effect for new questions - append to existing, don't replace
      setTypewriterQuestions(prev => ({
        ...prev,
        [sectionId]: [...(prev[sectionId] || []), ...questions]
      }));

      // Add questions one by one with typewriter effect
      for (let i = 0; i < questions.length; i++) {
        await new Promise(resolve => setTimeout(resolve, i * 1000));

        const updatedGuide = {
          ...discussionGuide,
          sections: discussionGuide.sections.map((section: any) => {
            if (section.id === sectionId) {
              const newQuestions = [...section.questions, questions[i]];
              return {
                ...section,
                questions: newQuestions
              };
            }
            return section;
          })
        };
        onGuideUpdate(updatedGuide);
      }

      console.log('Questions added successfully');
    } catch (error) {
      console.error('Error generating AI questions:', error);
      alert(`Beklenmeyen bir hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    } finally {
      setLoadingQuestions(prev => ({
        ...prev,
        [sectionId]: false
      }));
      setGeneratingQuestions(prev => ({
        ...prev,
        [sectionId]: false
      }));
    }
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
  const renderStartingView = () => {
    const completedInterviews = Math.floor(Math.random() * 3) + 2; // Simulate progress
    const totalInterviews = participants.length;
    return <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-status-success-light rounded-full flex items-center justify-center mx-auto mb-6">
            <PlayCircle className="w-8 h-8 text-status-success" />
          </div>
          
          <h3 className="text-xl font-semibold text-text-primary mb-2">
            Araştırma Devam Ediyor
          </h3>
          
          <p className="text-text-secondary mb-6">
            {completedInterviews} / {totalInterviews} görüşme tamamlandı
          </p>
          
          <div className="space-y-3 mb-6">
            {participants.map((participant, index) => {
            const isCompleted = index < completedInterviews;
            const isActive = index === completedInterviews;
            return <div key={participant.id} className="flex items-center justify-between p-3 bg-surface rounded-lg">
                   <div className="flex items-center space-x-3">
                     <div className="w-8 h-8 bg-brand-primary-light rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium text-brand-primary">
                          {participant.name ? participant.name.split(' ').map((n: string) => n[0]).join('') : participant.email ? participant.email.substring(0, 2).toUpperCase() : 'P'}
                        </span>
                     </div>
                     <span className="text-sm font-medium text-text-primary">
                       {participant.name || participant.email || 'Participant'}
                     </span>
                   </div>
                  
                  <div className="flex items-center space-x-2">
                    {isCompleted ? <>
                        <CheckCircle2 className="w-4 h-4 text-status-success" />
                        <span className="text-xs text-status-success">Tamamlandı</span>
                      </> : isActive ? <>
                        <Circle className="w-4 h-4 text-brand-primary animate-pulse" />
                        <span className="text-xs text-brand-primary">Görüşmede</span>
                      </> : <>
                        <Clock className="w-4 h-4 text-text-muted" />
                        <span className="text-xs text-text-muted">Bekliyor</span>
                      </>}
                  </div>
                </div>;
          })}
          </div>
          
          <div className="bg-surface p-4 rounded-lg">
            <div className="flex items-center justify-center space-x-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-status-success rounded-full"></div>
                <span className="text-text-secondary">Ekran kaydı aktif</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-status-success rounded-full"></div>
                <span className="text-text-secondary">Kamera aktif</span>
              </div>
            </div>
          </div>
        </div>
      </div>;
  };
  const renderAnalysisView = () => <div className="space-y-6">
      {/* Research Summary with Typewriter */}
      <div className="bg-surface p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          {showAnalysisTypewriter ? <TypewriterText text="Araştırma Özeti" speed={40} onComplete={() => {}} /> : "Araştırma Özeti"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-primary">
              {showAnalysisTypewriter ? <TypewriterText text="5" speed={100} delay={1000} /> : "5"}
            </div>
            <div className="text-sm text-text-secondary">Toplam Görüşme</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-primary">
              {showAnalysisTypewriter ? <TypewriterText text="42" speed={100} delay={1500} /> : "42"}
            </div>
            <div className="text-sm text-text-secondary">Dakika</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-primary">
              {showAnalysisTypewriter ? <TypewriterText text="8" speed={100} delay={2000} /> : "8"}
            </div>
            <div className="text-sm text-text-secondary">Ana Tema</div>
          </div>
        </div>
      </div>

      {/* Asked Questions */}
      <div className="bg-surface p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Sorulan Sorular</h3>
        <div className="space-y-3">
          {discussionGuide?.sections?.map((section: any) => <div key={section.id} className="border-l-2 border-brand-primary-light pl-4">
              <h4 className="font-medium text-text-primary mb-2">{section.title}</h4>
              <ul className="space-y-1">
                {section.questions.slice(0, 2).map((question: string, index: number) => <li key={index} className="text-sm text-text-secondary">• {question}</li>)}
              </ul>
            </div>)}
        </div>
      </div>

      {/* Given Answers */}
      <div className="bg-surface p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Verilen Cevaplar</h3>
        <div className="space-y-4">
          <div className="p-4 bg-canvas rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-6 h-6 bg-brand-primary-light rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-brand-primary">AK</span>
              </div>
              <span className="text-sm font-medium text-text-primary">Ahmet Kılıç</span>
            </div>
            <p className="text-sm text-text-secondary">"Mevcut bankacılık uygulamaları çok karmaşık. Daha basit bir arayüz isterdim..."</p>
          </div>
          <div className="p-4 bg-canvas rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-6 h-6 bg-brand-primary-light rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-brand-primary">MÖ</span>
              </div>
              <span className="text-sm font-medium text-text-primary">Merve Özkan</span>
            </div>
            <p className="text-sm text-text-secondary">"Güvenlik çok önemli ama kullanılabilirlik de ihmal edilmemeli..."</p>
          </div>
        </div>
      </div>

      {/* Common Points & Trends with Typewriter */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-text-primary mb-4">
            {showAnalysisTypewriter ? <TypewriterText text="Ortak Noktalar" speed={40} delay={3000} /> : "Ortak Noktalar"}
          </h3>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-status-success rounded-full mt-2"></div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {showAnalysisTypewriter ? <TypewriterText text="Basitlik İsteği" speed={30} delay={4000} /> : "Basitlik İsteği"}
                </p>
                <p className="text-xs text-text-secondary">
                  {showAnalysisTypewriter ? <TypewriterText text="5/5 katılımcı daha basit arayüz istiyor" speed={20} delay={4500} /> : "5/5 katılımcı daha basit arayüz istiyor"}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-status-success rounded-full mt-2"></div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {showAnalysisTypewriter ? <TypewriterText text="Güvenlik Endişesi" speed={30} delay={5000} /> : "Güvenlik Endişesi"}
                </p>
                <p className="text-xs text-text-secondary">
                  {showAnalysisTypewriter ? <TypewriterText text="4/5 katılımcı güvenlik önceliği vurguluyor" speed={20} delay={5500} /> : "4/5 katılımcı güvenlik önceliği vurguluyor"}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-status-warning rounded-full mt-2"></div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {showAnalysisTypewriter ? <TypewriterText text="Mobil Öncelik" speed={30} delay={6000} /> : "Mobil Öncelik"}
                </p>
                <p className="text-xs text-text-secondary">
                  {showAnalysisTypewriter ? <TypewriterText text="3/5 katılımcı mobil odaklı çözüm istiyor" speed={20} delay={6500} /> : "3/5 katılımcı mobil odaklı çözüm istiyor"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Genel Eğilimler</h3>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <TrendingUp className="w-4 h-4 text-status-success mt-1" />
              <div>
                <p className="text-sm font-medium text-text-primary">Pozitif Geri Bildirim</p>
                <p className="text-xs text-text-secondary">Genel konsept %80 olumlu karşılandı</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-4 h-4 text-status-warning mt-1" />
              <div>
                <p className="text-sm font-medium text-text-primary">İyileştirme Alanları</p>
                <p className="text-xs text-text-secondary">Navigasyon ve filtreleme özellikleri</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Users className="w-4 h-4 text-brand-primary mt-1" />
              <div>
                <p className="text-sm font-medium text-text-primary">Hedef Kitle</p>
                <p className="text-xs text-text-secondary">25-45 yaş arası profesyoneller odaklı</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Insights */}
      <div className="bg-surface p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Ana Temalar</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="p-4 bg-canvas rounded-lg">
              <h4 className="font-medium text-text-primary mb-2">🎯 Kullanılabilirlik</h4>
              <p className="text-sm text-text-secondary">Katılımcılar mevcut çözümlerin çok karmaşık olduğunu düşünüyor ve daha sezgisel arayüzler istiyor.</p>
            </div>
            <div className="p-4 bg-canvas rounded-lg">
              <h4 className="font-medium text-text-primary mb-2">🔒 Güvenlik</h4>
              <p className="text-sm text-text-secondary">Finansal işlemlerde güvenlik en önemli faktör olarak görülüyor ancak kullanıcı deneyimini engellemeden.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="p-4 bg-canvas rounded-lg">
              <h4 className="font-medium text-text-primary mb-2">📱 Mobil Odaklılık</h4>
              <p className="text-sm text-text-secondary">Kullanıcılar çoğunlukla mobil cihazlarından işlem yapıyor ve masaüstü deneyimine göre öncelik veriyor.</p>
            </div>
            <div className="p-4 bg-canvas rounded-lg">
              <h4 className="font-medium text-text-primary mb-2">⚡ Hız</h4>
              <p className="text-sm text-text-secondary">Yavaş loading süreler ve çok adımlı işlemler kullanıcı memnuniyetsizliğinin ana kaynağı.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div className="bg-surface p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Rapor Dışa Aktarma</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm">
            <FileText className="w-4 h-4 mr-2" />
            PDF Rapor
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            CSV Verileri
          </Button>
          <Button variant="outline" size="sm">
            <Share className="w-4 h-4 mr-2" />
            Paylaš
          </Button>
        </div>
      </div>
    </div>;
  if (!discussionGuide) {
    return <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-brand-primary-light rounded-lg flex items-center justify-center mx-auto mb-3">
            <Video className="w-6 h-6 text-brand-primary" />
          </div>
          <TypewriterText text="Tartışma kılavuzu oluşturuluyor..." speed={50} className="text-text-secondary" showCursor={true} />
        </div>
      </div>;
  }
  return <div className="h-full flex flex-col overflow-hidden">
      {/* Study Header */}
      <div className="border-b border-border-light p-6 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <div className="group">
            {showTitleTypewriter ? <TypewriterText text={discussionGuide.title} speed={30} className="text-lg font-semibold text-text-primary" enableControls={true} onComplete={() => setShowTitleTypewriter(false)} /> : <h2 className="text-lg font-semibold text-text-primary">{discussionGuide.title}</h2>}
            <p className="mt-2 text-sm font-medium text-text-secondary">
              Kullanıcılara sorulacak sorular
            </p>
          </div>
          
          
        </div>
        
        {currentStep === 'run' && participants.length > 0 && <div className="text-sm text-text-secondary">
            {participants.filter(p => getInterviewStatus(p.id) === 'Tamamlandı').length} / {participants.length} görüşme tamamlandı
          </div>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {currentStep === 'starting' ? renderStartingView() : currentStep === 'analyze' ? renderAnalysisView() : <div className="space-y-6">
            {/* Discussion Guide Sections */}
            {discussionGuide.sections.map((section: any) => <Card key={section.id} className="p-6">
                <CardHeader className="p-0 mb-4">
                  <CardTitle className="text-base font-semibold text-text-primary group">
                    {showSectionTypewriters[section.id] ? <TypewriterText text={section.title} speed={25} delay={discussionGuide.sections.indexOf(section) * 500} enableControls={true} onComplete={() => setShowSectionTypewriters(prev => ({
                ...prev,
                [section.id]: false
              }))} /> : section.title}
                  </CardTitle>
                </CardHeader>
                
                <CardContent className="p-0 space-y-3">
                  {section.questions.map((question: string, index: number) => {
              const isRecentlyAdded = typewriterQuestions[section.id]?.includes(question);
              const questionKey = `${section.id}-${index}`;
              const shouldShowTypewriter = showQuestionTypewriters[questionKey];

              // Calculate delay: 2 seconds base + staggered delay based on position
              let globalQuestionIndex = 0;
              for (let i = 0; i < discussionGuide.sections.indexOf(section); i++) {
                globalQuestionIndex += discussionGuide.sections[i].questions.length;
              }
              globalQuestionIndex += index;
              const questionDelay = 2000 + globalQuestionIndex * 800; // 2s base + 0.8s between questions

              return <div key={`${section.id}-${index}`} className="group flex items-start space-x-2">
                        <span className="text-xs text-text-muted mt-2 w-5">
                          {index + 1}.
                        </span>
                        
                        <div className="flex-1">
                          {editingQuestion === `${section.id}-${index}` ? <div className="space-y-2">
                                <Textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="text-sm" autoFocus />
                                <div className="flex space-x-2">
                                  <Button size="sm" onClick={() => handleSaveQuestion(section.id, index)}>
                                    Kaydet
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setEditingQuestion(null)}>
                                    İptal
                                  </Button>
                                </div>
                              </div> : <div className="text-sm text-text-primary cursor-text hover:bg-surface rounded p-2 -m-2 transition-colors" onClick={() => handleEditQuestion(`${section.id}-${index}`, question)}>
                              {shouldShowTypewriter ? <TypewriterText text={question} speed={25} className="text-text-primary" enableControls={true} onComplete={() => setShowQuestionTypewriters(prev => ({
                      ...prev,
                      [questionKey]: false
                    }))} /> : isRecentlyAdded ? <TypewriterText text={question} speed={30} className="text-text-primary" /> : shouldShowTypewriter === false ? question : null}
                            </div>}
                        </div>
                        
                        <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleEditQuestion(`${section.id}-${index}`, question)}>
                          <Edit3 className="w-3 h-3" />
                        </Button>
                      </div>;
            })}
                  
                   {/* Loading State with Typewriter */}
                  {loadingQuestions[section.id] && <div className="flex items-center space-x-2 p-2 text-text-secondary">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <TypewriterText text={loadingMessages[currentLoadingIndex]} speed={50} className="text-sm text-text-secondary" showCursor={false} />
                    </div>}
                  
                  <div className="flex items-center space-x-2">
                    <Button size="sm" variant="ghost" onClick={() => handleAddQuestion(section.id)} className="flex items-center space-x-1 text-text-secondary hover:text-text-primary" disabled={generatingQuestions[section.id]}>
                      <Plus className="w-3 h-3" />
                      <span>Soru ekle</span>
                    </Button>
                    
                    <Button size="sm" variant="ghost" onClick={() => generateAIQuestions(section.id, section.title)} className="flex items-center space-x-1 text-brand-primary hover:text-brand-primary-hover" disabled={generatingQuestions[section.id] || loadingQuestions[section.id]}>
                      {generatingQuestions[section.id] ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      <span>AI soru üret</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>)}

            {/* Participants (when recruited) */}
            {participants.length > 0 && currentStep !== 'guide' && <Card className="p-6">
                <CardHeader className="p-0 mb-4">
                  <CardTitle className="text-base font-semibold text-text-primary flex items-center space-x-2">
                    <User className="w-4 h-4" />
                    <span>
                      <TypewriterText text={`Katılımcılar (${participants.length})`} speed={40} delay={0} />
                    </span>
                  </CardTitle>
                </CardHeader>
                
                <CardContent className="p-0 space-y-3">
                  {participants.map((participant, index) => {
              const status = getInterviewStatus(participant.id);
              return <div key={participant.id} className="flex items-center justify-between p-3 bg-surface rounded-lg group">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-brand-primary-light rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-brand-primary">
                              {participant.name ? participant.name.split(' ').map((n: string) => n[0]).join('') : 'P'}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-text-primary">
                              <TypewriterText text={participant.name} speed={20} delay={index * 200} showCursor={false} />
                            </p>
                            <p className="text-xs text-text-secondary">
                              <TypewriterText text={participant.role} speed={15} delay={index * 200 + 500} showCursor={false} />
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(status)}
                          <span className="text-xs text-text-secondary">{status}</span>
                        </div>
                      </div>;
            })}
                </CardContent>
              </Card>}
          </div>}
      </div>
    </div>;
};
export default StudyPanel;
