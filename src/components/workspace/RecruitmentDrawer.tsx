import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Users, Globe, Briefcase, Clock, MapPin, Star, Filter, Zap } from "lucide-react";
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
const generateParticipants = (): Participant[] => [{
  id: 'p1',
  name: 'Ayşe Demir',
  role: 'Ürün Pazarlama Müdürü',
  company: 'TechFlow Inc',
  experience: '5+ yıl',
  location: 'İstanbul, TR',
  timezone: 'TRT',
  rating: 4.9,
  languages: ['Türkçe', 'İngilizce'],
  availability: 'Şu anda müsait',
  bio: 'B2B pazarlama ve kullanıcı araştırması konularında deneyimli. 20+ müşteri görüşmesi yönetti.'
}, {
  id: 'p2',
  name: 'Mehmet Çelik',
  role: 'Pazarlama Direktörü',
  company: 'StartupBase',
  experience: '8+ yıl',
  location: 'Ankara, TR',
  timezone: 'TRT',
  rating: 4.8,
  languages: ['Türkçe', 'İngilizce'],
  availability: '2 saat sonra müsait',
  bio: 'SaaS platformları ve kullanıcı kazanımı konularında kapsamlı deneyime sahip büyüme pazarlama uzmanı.'
}, {
  id: 'p3',
  name: 'Elif Kaya',
  role: 'Kıdemli Pazarlama Uzmanı',
  company: 'Digital Solutions Co',
  experience: '6+ yıl',
  location: 'İzmir, TR',
  timezone: 'TRT',
  rating: 4.7,
  languages: ['Türkçe'],
  availability: 'Şu anda müsait',
  bio: 'Dijital pazarlama analitiği ve müşteri yolculuğu optimizasyonu konularında uzman.'
}, {
  id: 'p4',
  name: 'Can Özkan',
  role: 'Pazarlama Genel Müdür Yardımcısı',
  company: 'CloudTech',
  experience: '10+ yıl',
  location: 'Bursa, TR',
  timezone: 'TRT',
  rating: 4.9,
  languages: ['Türkçe', 'İngilizce'],
  availability: '1 saat sonra müsait',
  bio: 'AI/ML ürünleri ve kurumsal satış konularında derin deneyime sahip pazarlama lideri.'
}, {
  id: 'p5',
  name: 'Zeynep Aktaş',
  role: 'Pazarlama Operasyonları Müdürü',
  company: 'InnovateCorp',
  experience: '4+ yıl',
  location: 'Antalya, TR',
  timezone: 'TRT',
  rating: 4.6,
  languages: ['Türkçe'],
  availability: 'Şu anda müsait',
  bio: 'B2B organizasyonları için pazarlama otomasyonu ve veri odaklı karar verme uzmanı.'
}];
const RecruitmentDrawer = ({
  open,
  onOpenChange,
  onParticipantsSelect
}: RecruitmentDrawerProps) => {
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    country: 'tr',
    language: 'all',
    experience: 'all',
    role: 'all'
  });
  const participants = generateParticipants();
  const handleParticipantToggle = (participantId: string) => {
    setSelectedParticipants(prev => prev.includes(participantId) ? prev.filter(id => id !== participantId) : [...prev, participantId]);
  };
  const handleQuickRecruit = () => {
    const quickSelect = participants.slice(0, 5).map(p => p.id);
    setSelectedParticipants(quickSelect);
  };
  const handleConfirmSelection = () => {
    const selected = participants.filter(p => selectedParticipants.includes(p.id));
    onParticipantsSelect(selected);
  };
  return <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[800px] sm:max-w-[800px] p-0">
        <div className="h-full flex flex-col">
          {/* Header */}
          <SheetHeader className="p-6 border-b border-border-light">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-xl font-semibold text-text-primary">
                  Katılımcı Bulma
                </SheetTitle>
                <SheetDescription className="text-text-secondary mt-1">Türkiye ve Dünya çapında milyonlarca ön nitelikli görüşmeciye erişim sağlayın.</SheetDescription>
              </div>
              
              <div className="flex items-center space-x-3">
                <Button variant="outline" className="flex items-center space-x-2">
                  <Users className="w-4 h-4" />
                  <span>Daha Fazla Organize Et</span>
                </Button>
                
                <Button onClick={handleQuickRecruit} className="bg-brand-primary hover:bg-brand-primary-hover text-white flex items-center space-x-2">
                  <Zap className="w-4 h-4" />
                  <span>Şimdi 5 kişi bul</span>
                </Button>
              </div>
            </div>
          </SheetHeader>

          {/* Filters */}
          <div className="p-6 border-b border-border-light bg-surface">
            <div className="flex items-center space-x-2 mb-4">
              <Filter className="w-4 h-4 text-text-secondary" />
              <span className="text-sm font-medium text-text-secondary">Filtreler</span>
            </div>
            
            <div className="grid grid-cols-4 gap-4">
              <Select value={filters.country} onValueChange={value => setFilters({
              ...filters,
              country: value
            })}>
                <SelectTrigger>
                  <SelectValue placeholder="Ülke" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Ülkeler</SelectItem>
                  <SelectItem value="tr">Türkiye</SelectItem>
                  <SelectItem value="us">Amerika Birleşik Devletleri</SelectItem>
                  <SelectItem value="uk">Birleşik Krallık</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.language} onValueChange={value => setFilters({
              ...filters,
              language: value
            })}>
                <SelectTrigger>
                  <SelectValue placeholder="Dil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Diller</SelectItem>
                  <SelectItem value="tr">Türkçe</SelectItem>
                  <SelectItem value="en">İngilizce</SelectItem>
                  <SelectItem value="es">İspanyolca</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.experience} onValueChange={value => setFilters({
              ...filters,
              experience: value
            })}>
                <SelectTrigger>
                  <SelectValue placeholder="Deneyim" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Seviyeler</SelectItem>
                  <SelectItem value="junior">1-3 yıl</SelectItem>
                  <SelectItem value="mid">4-7 yıl</SelectItem>
                  <SelectItem value="senior">8+ yıl</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.role} onValueChange={value => setFilters({
              ...filters,
              role: value
            })}>
                <SelectTrigger>
                  <SelectValue placeholder="Rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Roller</SelectItem>
                  <SelectItem value="marketing">Pazarlama</SelectItem>
                  <SelectItem value="product">Ürün</SelectItem>
                  <SelectItem value="sales">Satış</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Participants List */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">
                Pazarlama Profesyonelleri ({participants.length} müsait)
              </h3>
              <Badge variant="outline" className="text-brand-primary border-brand-primary">
                {selectedParticipants.length} seçildi
              </Badge>
            </div>

            <div className="space-y-4">
              {participants.map(participant => <Card key={participant.id} className={`cursor-pointer transition-all duration-200 ${selectedParticipants.includes(participant.id) ? 'ring-2 ring-brand-primary border-brand-primary' : 'hover:border-brand-primary'}`} onClick={() => handleParticipantToggle(participant.id)}>
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
                            {participant.role} - {participant.company}
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
                      
                      <div className={`w-5 h-5 rounded-full border-2 transition-colors ${selectedParticipants.includes(participant.id) ? 'bg-brand-primary border-brand-primary' : 'border-border'}`}>
                        {selectedParticipants.includes(participant.id) && <div className="w-full h-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full" />
                          </div>}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {participant.bio}
                    </p>
                    
                    <div className="flex items-center space-x-2 mt-3">
                      {participant.languages.map(lang => <Badge key={lang} variant="secondary" className="text-xs">
                          {lang}
                        </Badge>)}
                    </div>
                  </CardContent>
                </Card>)}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border-light p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-text-secondary">
                {selectedParticipants.length} katılımcı seçildi
              </div>
              
              <div className="flex items-center space-x-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  İptal
                </Button>
                <Button onClick={handleConfirmSelection} disabled={selectedParticipants.length === 0} className="bg-brand-primary hover:bg-brand-primary-hover text-white">
                  {selectedParticipants.length} katılımcı ekle
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>;
};
export default RecruitmentDrawer;