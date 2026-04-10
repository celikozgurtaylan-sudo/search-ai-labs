import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Star, Zap, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Subscriptions = () => {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const plans = [
    {
      id: "freemium",
      name: "Freemium",
      price: "Ücretsiz",
      icon: <CheckCircle className="w-6 h-6" />,
      features: [
        "Ayda 5 katılımcı görüşmesi",
        "Temel filtreleme",
        "Email desteği",
        "Standart raporlama"
      ],
      limitations: [
        "Sınırlı katılımcı havuzu",
        "Temel analitics"
      ],
      buttonText: "Şu anki planınız",
      buttonVariant: "outline" as const,
      popular: false
    },
    {
      id: "plus",
      name: "Plus",
      price: "₺299/ay",
      icon: <Star className="w-6 h-6" />,
      features: [
        "Ayda 50 katılımcı görüşmesi",
        "Gelişmiş filtreleme",
        "Öncelikli destek",
        "Detaylı analitics",
        "Özel katılımcı segmentleri",
        "Video kayıt özelliği"
      ],
      limitations: [],
      buttonText: "Upgrade Et",
      buttonVariant: "default" as const,
      popular: true
    },
    {
      id: "pro",
      name: "Pro+",
      price: "₺599/ay",
      icon: <Crown className="w-6 h-6" />,
      features: [
        "Sınırsız katılımcı görüşmesi",
        "AI destekli öneriler",
        "Özel hesap yöneticisi",
        "Gerçek zamanlı analitics",
        "API erişimi",
        "Özel entegrasyonlar",
        "Beyaz etiket çözümler",
        "Advanced reporting dashboard"
      ],
      limitations: [],
      buttonText: "Upgrade Et",
      buttonVariant: "default" as const,
      popular: false
    }
  ];

  const handlePlanSelect = (planId: string) => {
    setSelectedPlan(planId);
    // Here you would typically integrate with Stripe or payment processing
    console.log(`Selected plan: ${planId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Abonelik Planları</h1>
              <p className="text-text-secondary mt-1">
                İhtiyaçlarınıza en uygun planı seçin ve araştırmalarınızı güçlendirin
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => navigate('/workspace')}
              className="flex items-center space-x-2"
            >
              <span>Workspace'e Dön</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <Card 
              key={plan.id} 
              className={`relative transition-all duration-200 ${
                plan.popular 
                  ? 'ring-2 ring-brand-primary border-brand-primary scale-105' 
                  : 'hover:border-brand-primary'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-brand-primary text-white px-3 py-1">
                    En Popüler
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4 text-brand-primary">
                  {plan.icon}
                </div>
                <CardTitle className="text-xl font-bold text-text-primary">
                  {plan.name}
                </CardTitle>
                <div className="text-3xl font-bold text-text-primary mt-2">
                  {plan.price}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <CheckCircle className="w-5 h-5 text-brand-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-text-secondary">{feature}</span>
                    </div>
                  ))}
                </div>

                {plan.limitations.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <p className="text-xs text-text-muted mb-2">Sınırlamalar:</p>
                    {plan.limitations.map((limitation, index) => (
                      <div key={index} className="flex items-start space-x-2">
                        <div className="w-5 h-5 flex items-center justify-center mt-0.5">
                          <div className="w-2 h-2 bg-text-muted rounded-full" />
                        </div>
                        <span className="text-xs text-text-muted">{limitation}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-6">
                  <Button
                    variant={plan.buttonVariant}
                    className={`w-full ${
                      plan.buttonVariant === 'default' 
                        ? 'bg-brand-primary hover:bg-brand-primary-hover text-white'
                        : ''
                    }`}
                    onClick={() => handlePlanSelect(plan.id)}
                    disabled={plan.id === 'freemium'}
                  >
                    {plan.buttonText}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Additional Info */}
        <div className="mt-12 text-center">
          <div className="bg-surface rounded-lg p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Zap className="w-5 h-5 text-brand-primary" />
              <h3 className="text-lg font-semibold text-text-primary">
                Tüm planlar şunları içerir:
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm text-text-secondary">
              <div>✅ SSL güvenliği</div>
              <div>✅ Veri şifreleme</div>
              <div>✅ GDPR uyumluluğu</div>
              <div>✅ 7/24 sistem izleme</div>
            </div>
            <p className="text-xs text-text-muted mt-4">
              Planınızı istediğiniz zaman iptal edebilir veya değiştirebilirsiniz.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Subscriptions;