import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Workspace from "./pages/Workspace";
import ProjectHistory from "./pages/ProjectHistory";
import Subscriptions from "./pages/Subscriptions";
import NotFound from "./pages/NotFound";
import ParticipantLanding from "./pages/ParticipantLanding";
import StudySession from "./pages/StudySession";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/projects" element={<ProjectHistory />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/participate/:token" element={<ParticipantLanding />} />
            <Route path="/join/research/:token" element={<ParticipantLanding />} />
            <Route path="/study-session/:sessionToken" element={<StudySession />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
