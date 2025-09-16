import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MessageSquare, Calendar, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { projectService, Project } from "@/services/projectService";
import { toast } from "sonner";
import { format } from "date-fns";

const ProjectHistory = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadProjects();
    } else {
      navigate('/auth');
    }
  }, [user, navigate]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const userProjects = await projectService.getUserProjects();
      setProjects(userProjects);
    } catch (error) {
      console.error('Failed to load projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueProject = (project: Project) => {
    // Store project data for the workspace
    localStorage.setItem('searchai-project', JSON.stringify({
      id: project.id,
      description: project.description,
      template: project.analysis?.template || null,
      timestamp: Date.now()
    }));
    
    navigate('/workspace');
  };

  const getProjectTypeIcon = (project: Project) => {
    const template = project.analysis?.template;
    switch (template) {
      case 'ad-testing':
        return 'bg-blue-50 text-blue-600';
      case 'landing-page':
        return 'bg-green-50 text-green-600';
      case 'nps-feedback':
        return 'bg-purple-50 text-purple-600';
      default:
        return 'bg-orange-50 text-orange-600';
    }
  };

  const getProjectTypeName = (project: Project) => {
    const template = project.analysis?.template;
    switch (template) {
      case 'ad-testing':
        return 'Reklam Testi';
      case 'landing-page':
        return 'Açılış Sayfası';
      case 'nps-feedback':
        return 'NPS Araştırması';
      default:
        return 'Temel Araştırma';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="animate-pulse">
            <div className="h-8 bg-surface rounded w-1/4 mb-8"></div>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-surface rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="border-b border-border-light">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                  <ArrowLeft className="w-4 h-4" />
                  <span>Ana Sayfa</span>
                </Button>
              </Link>
              <h1 className="text-xl font-semibold text-text-primary">Projelerim</h1>
            </div>
            
            <div className="flex items-center space-x-2 bg-surface px-3 py-2 rounded-full border border-border-light">
              <div className="w-6 h-6 bg-brand-primary rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-white">
                  {user?.email?.substring(0, 2).toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-medium text-text-primary">
                {user?.user_metadata?.display_name || 'Demo User'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-text-primary mb-2">
            Geçmiş Araştırmalarınız
          </h2>
          <p className="text-text-secondary">
            Daha önce oluşturduğunuz projeleri görüntüleyin ve devam ettirin.
          </p>
        </div>

        {projects.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <MessageSquare className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Henüz proje yok
              </h3>
              <p className="text-text-secondary mb-6">
                İlk projenizi oluşturmak için ana sayfaya dönün.
              </p>
              <Link to="/">
                <Button className="bg-brand-primary hover:bg-brand-primary-hover text-white">
                  Yeni Proje Başlat
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <Card 
                key={project.id} 
                className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-brand-primary group"
                onClick={() => handleContinueProject(project)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getProjectTypeIcon(project)}`}>
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg font-semibold text-text-primary group-hover:text-brand-primary transition-colors">
                          {project.title}
                        </CardTitle>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {getProjectTypeName(project)}
                          </Badge>
                          <div className="flex items-center text-xs text-text-muted space-x-1">
                            <Calendar className="w-3 h-3" />
                            <span>{format(new Date(project.created_at!), 'dd/MM/yyyy')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Devam Et
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-text-secondary line-clamp-2">
                    {project.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ProjectHistory;