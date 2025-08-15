import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { 
  Users, 
  Globe, 
  Briefcase, 
  Clock, 
  MapPin, 
  Star,
  Filter,
  Zap
} from "lucide-react";

interface Participant {
  id: string;
  name: string;
  role: string;
  company: string;
  experience: string;
  location: string;
  timezone: string;
  rating: number;
  languages: string[];
  availability: string;
  bio: string;
}

interface RecruitmentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParticipantsSelect: (participants: Participant[]) => void;
}

const generateParticipants = (): Participant[] => [
  {
    id: 'p1',
    name: 'Sarah Martinez',
    role: 'Product Marketing Manager',
    company: 'TechFlow Inc',
    experience: '5+ years',
    location: 'San Francisco, CA',
    timezone: 'PST',
    rating: 4.9,
    languages: ['English', 'Spanish'],
    availability: 'Available now',
    bio: 'Experienced in B2B marketing and user research. Led 20+ customer interview sessions.'
  },
  {
    id: 'p2',
    name: 'Michael Chen',
    role: 'Marketing Director',
    company: 'StartupBase',
    experience: '8+ years',
    location: 'New York, NY',
    timezone: 'EST',
    rating: 4.8,
    languages: ['English', 'Mandarin'],
    availability: 'Available in 2h',
    bio: 'Growth marketing expert with extensive experience in SaaS platforms and user acquisition.'
  },
  {
    id: 'p3',
    name: 'Emily Rodriguez',
    role: 'Senior Marketing Specialist',
    company: 'Digital Solutions Co',
    experience: '6+ years',
    location: 'Austin, TX',
    timezone: 'CST',
    rating: 4.7,
    languages: ['English'],
    availability: 'Available now',
    bio: 'Specializes in digital marketing analytics and customer journey optimization.'
  },
  {
    id: 'p4',
    name: 'David Kim',
    role: 'VP of Marketing',
    company: 'CloudTech',
    experience: '10+ years',
    location: 'Seattle, WA',
    timezone: 'PST',
    rating: 4.9,
    languages: ['English', 'Korean'],
    availability: 'Available in 1h',
    bio: 'Marketing leader with deep experience in AI/ML products and enterprise sales.'
  },
  {
    id: 'p5',
    name: 'Lisa Thompson',
    role: 'Marketing Operations Manager',
    company: 'InnovateCorp',
    experience: '4+ years',
    location: 'Chicago, IL',
    timezone: 'CST',
    rating: 4.6,
    languages: ['English'],
    availability: 'Available now',
    bio: 'Expert in marketing automation and data-driven decision making for B2B organizations.'
  }
];

const RecruitmentDrawer = ({ open, onOpenChange, onParticipantsSelect }: RecruitmentDrawerProps) => {
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    country: 'all',
    language: 'all',
    experience: 'all',
    role: 'all'
  });

  const participants = generateParticipants();

  const handleParticipantToggle = (participantId: string) => {
    setSelectedParticipants(prev => 
      prev.includes(participantId)
        ? prev.filter(id => id !== participantId)
        : [...prev, participantId]
    );
  };

  const handleQuickRecruit = () => {
    const quickSelect = participants.slice(0, 5).map(p => p.id);
    setSelectedParticipants(quickSelect);
  };

  const handleConfirmSelection = () => {
    const selected = participants.filter(p => selectedParticipants.includes(p.id));
    onParticipantsSelect(selected);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[800px] sm:max-w-[800px] p-0">
        <div className="h-full flex flex-col">
          {/* Header */}
          <SheetHeader className="p-6 border-b border-border-light">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-xl font-semibold text-text-primary">
                  Recruit Participants
                </SheetTitle>
                <SheetDescription className="text-text-secondary mt-1">
                  Access to millions of pre-qualified interviewees worldwide
                </SheetDescription>
              </div>
              
              <Button
                onClick={handleQuickRecruit}
                className="bg-brand-primary hover:bg-brand-primary-hover text-white flex items-center space-x-2"
              >
                <Zap className="w-4 h-4" />
                <span>Recruit 5 now</span>
              </Button>
            </div>
          </SheetHeader>

          {/* Filters */}
          <div className="p-6 border-b border-border-light bg-surface">
            <div className="flex items-center space-x-2 mb-4">
              <Filter className="w-4 h-4 text-text-secondary" />
              <span className="text-sm font-medium text-text-secondary">Filters</span>
            </div>
            
            <div className="grid grid-cols-4 gap-4">
              <Select value={filters.country} onValueChange={(value) => setFilters({...filters, country: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="uk">United Kingdom</SelectItem>
                  <SelectItem value="ca">Canada</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.language} onValueChange={(value) => setFilters({...filters, language: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Languages</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.experience} onValueChange={(value) => setFilters({...filters, experience: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Experience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="junior">1-3 years</SelectItem>
                  <SelectItem value="mid">4-7 years</SelectItem>
                  <SelectItem value="senior">8+ years</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.role} onValueChange={(value) => setFilters({...filters, role: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Participants List */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">
                Marketing Professionals ({participants.length} available)
              </h3>
              <Badge variant="outline" className="text-brand-primary border-brand-primary">
                {selectedParticipants.length} selected
              </Badge>
            </div>

            <div className="space-y-4">
              {participants.map((participant) => (
                <Card 
                  key={participant.id}
                  className={`cursor-pointer transition-all duration-200 ${
                    selectedParticipants.includes(participant.id)
                      ? 'ring-2 ring-brand-primary border-brand-primary'
                      : 'hover:border-brand-primary'
                  }`}
                  onClick={() => handleParticipantToggle(participant.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="w-12 h-12 bg-brand-primary-light rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold text-brand-primary">
                            {participant.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        
                        <div>
                          <CardTitle className="text-base font-semibold text-text-primary">
                            {participant.name}
                          </CardTitle>
                          <p className="text-sm text-text-secondary mt-1">
                            {participant.role} at {participant.company}
                          </p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-text-muted">
                            <div className="flex items-center space-x-1">
                              <Briefcase className="w-3 h-3" />
                              <span>{participant.experience}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <MapPin className="w-3 h-3" />
                              <span>{participant.location}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Clock className="w-3 h-3" />
                              <span>{participant.availability}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Star className="w-3 h-3" />
                              <span>{participant.rating}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className={`w-5 h-5 rounded-full border-2 transition-colors ${
                        selectedParticipants.includes(participant.id)
                          ? 'bg-brand-primary border-brand-primary'
                          : 'border-border'
                      }`}>
                        {selectedParticipants.includes(participant.id) && (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full" />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {participant.bio}
                    </p>
                    
                    <div className="flex items-center space-x-2 mt-3">
                      {participant.languages.map((lang) => (
                        <Badge key={lang} variant="secondary" className="text-xs">
                          {lang}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border-light p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-text-secondary">
                {selectedParticipants.length} participants selected
              </div>
              
              <div className="flex items-center space-x-3">
                <Button 
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmSelection}
                  disabled={selectedParticipants.length === 0}
                  className="bg-brand-primary hover:bg-brand-primary-hover text-white"
                >
                  Add {selectedParticipants.length} participants
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RecruitmentDrawer;