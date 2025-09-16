import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { participantService } from "@/services/participantService";
import { projectService } from "@/services/projectService";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Users, Video } from "lucide-react";

const ResearcherSession = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeSession = async () => {
      if (!token) {
        setError("Invalid session token");
        setLoading(false);
        return;
      }

      try {
        // Validate the token and get participant data
        const participant = await participantService.getParticipantByToken(token);
        
        if (!participant) {
          setError("Invalid or expired session token");
          setLoading(false);
          return;
        }

        // Get project data
        const project = await projectService.getProject(participant.project_id);
        
        if (!project) {
          setError("Project not found");
          setLoading(false);
          return;
        }

        // Store session data in localStorage for the workspace
        const sessionData = {
          participantToken: token,
          participant: participant,
          projectData: project.analysis || { 
            description: "Researcher Session",
            timestamp: Date.now()
          },
          researcherMode: true,
          autoStartPhase: 'starting'
        };

        localStorage.setItem('researcher-session', JSON.stringify(sessionData));
        
        // Navigate to workspace with session context
        navigate('/workspace', { 
          state: { 
            researcherSession: true,
            participantToken: token 
          } 
        });

      } catch (error) {
        console.error('Failed to initialize researcher session:', error);
        setError("Failed to load session");
        setLoading(false);
      }
    };

    initializeSession();
  }, [token, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-brand-primary" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              Araştırma Oturumu Yükleniyor
            </h2>
            <p className="text-text-secondary">
              Katılımcı bilgileri kontrol ediliyor ve oturum hazırlanıyor...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              Oturum Hatası
            </h2>
            <p className="text-text-secondary mb-4">
              {error}
            </p>
            <button 
              onClick={() => navigate('/')}
              className="text-brand-primary hover:underline"
            >
              Ana sayfaya dön
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
};

export default ResearcherSession;