import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Check if valid researcher session exists in localStorage
const hasValidResearcherSession = (): boolean => {
  try {
    const participantToken = localStorage.getItem('participantToken');
    const participantData = localStorage.getItem('participantData');
    const projectData = localStorage.getItem('projectData');
    
    return !!(participantToken && participantData && projectData);
  } catch {
    return false;
  }
};

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    // Check for researcher session
    const validSession = hasValidResearcherSession();
    setHasSession(validSession);
    
    // Only redirect to auth if no user AND no valid researcher session
    if (!loading && !user && !validSession) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 animate-spin border-2 border-brand-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  // Allow access if user is authenticated OR has valid researcher session
  if (!user && !hasSession) {
    return null;
  }

  return <>{children}</>;
};