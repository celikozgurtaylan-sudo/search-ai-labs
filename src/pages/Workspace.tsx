import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Search, ArrowLeft, Video, Users, Play, BarChart3 } from "lucide-react";
import ChatPanel from "@/components/workspace/ChatPanel";
import StudyPanel from "@/components/workspace/StudyPanel";
import RecruitmentDrawer from "@/components/workspace/RecruitmentDrawer";

interface ProjectData {
  description: string;
  template?: string;
  timestamp: number;
}

const Workspace = () => {
  const navigate = useNavigate();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [currentStep, setCurrentStep] = useState<'guide' | 'recruit' | 'run' | 'analyze'>('guide');
  const [showRecruitment, setShowRecruitment] = useState(false);
  const [discussionGuide, setDiscussionGuide] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('searchai-project');
    if (stored) {
      const data = JSON.parse(stored);
      setProjectData(data);
      
      // Auto-generate discussion guide
      setTimeout(() => {
        generateDiscussionGuide(data.description);
      }, 1000);
    } else {
      navigate('/');
    }
  }, [navigate]);

  const generateDiscussionGuide = (description: string) => {
    // Simulate AI-generated discussion guide
    const guide = {
      title: getProjectTitle(description),
      sections: [
        {
          id: 'background',
          title: 'Professional Background',
          questions: [
            'Can you tell me about your role and responsibilities?',
            'How long have you been working in this field?',
            'What tools do you currently use for [relevant context]?'
          ]
        },
        {
          id: 'first-impressions',
          title: 'First Impressions',
          questions: [
            'What\'s your initial reaction to this?',
            'What stands out to you most?',
            'How does this compare to what you\'re used to?',
            'What questions come to mind immediately?'
          ]
        },
        {
          id: 'detailed-exploration',
          title: 'Detailed Exploration',
          questions: [
            'Walk me through how you would typically approach this.',
            'What would make this more valuable to you?',
            'What concerns or hesitations do you have?',
            'How would this fit into your current workflow?',
            'What\'s missing that you\'d expect to see?'
          ]
        },
        {
          id: 'final-thoughts',
          title: 'Final Thoughts & Recommendations',
          questions: [
            'Overall, how would you rate this?',
            'What would you change if you could?',
            'Would you recommend this to a colleague? Why?',
            'Any final thoughts or suggestions?'
          ]
        }
      ],
      suggestions: [
        'Add pricing/competitor questions',
        'Add AI-related questions',
        'Add feature-specific questions',
        'Add accessibility questions',
        'Add mobile experience questions'
      ]
    };
    
    setDiscussionGuide(guide);
  };

  const getProjectTitle = (description: string) => {
    if (description.includes('listenlabs.ai')) return 'ListenLabs Landing Page Research';
    if (description.includes('advertisement') || description.includes('ad')) return 'Advertisement Testing Study';
    if (description.includes('NPS') || description.includes('banking')) return 'Customer Satisfaction Research';
    return 'User Experience Research Study';
  };

  const handleNextStep = () => {
    if (currentStep === 'guide') {
      setShowRecruitment(true);
    } else if (currentStep === 'recruit') {
      setCurrentStep('run');
    } else if (currentStep === 'run') {
      setCurrentStep('analyze');
    }
  };

  const getStepButton = () => {
    switch (currentStep) {
      case 'guide':
        return (
          <Button 
            onClick={handleNextStep}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white"
          >
            <Users className="w-4 h-4 mr-2" />
            Next: Add Participants →
          </Button>
        );
      case 'recruit':
        return (
          <Button 
            onClick={handleNextStep}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white"
            disabled={participants.length === 0}
          >
            <Play className="w-4 h-4 mr-2" />
            Start Interviews
          </Button>
        );
      case 'run':
        return (
          <Button 
            onClick={handleNextStep}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            View Analysis
          </Button>
        );
      default:
        return null;
    }
  };

  if (!projectData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="border-b border-border-light bg-white">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/')}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </Button>
              
              <Separator orientation="vertical" className="h-6" />
              
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-brand-primary rounded flex items-center justify-center">
                  <Search className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-text-primary">Search AI</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {getStepButton()}
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Panel - Chat */}
        <div className="w-1/2 border-r border-border-light">
          <ChatPanel 
            projectData={projectData}
            discussionGuide={discussionGuide}
            onGuideUpdate={setDiscussionGuide}
          />
        </div>

        {/* Right Panel - Study */}
        <div className="w-1/2">
          <StudyPanel 
            discussionGuide={discussionGuide}
            participants={participants}
            currentStep={currentStep}
            onGuideUpdate={setDiscussionGuide}
          />
        </div>
      </div>

      {/* Recruitment Drawer */}
      <RecruitmentDrawer 
        open={showRecruitment}
        onOpenChange={setShowRecruitment}
        onParticipantsSelect={(selected) => {
          setParticipants(selected);
          setCurrentStep('recruit');
          setShowRecruitment(false);
        }}
      />
    </div>
  );
};

export default Workspace;