import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Image as ImageIcon, Layers3, Link2, Monitor, Sparkles, TabletSmartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

const svgToDataUrl = (svg: string) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const createScreenSvg = (accent: string, title: string, subtitle: string, cta: string) =>
  svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280" fill="none">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accent}"/>
          <stop offset="100%" stop-color="#F5F1FF"/>
        </linearGradient>
      </defs>
      <rect width="720" height="1280" rx="56" fill="url(#bg)"/>
      <rect x="48" y="52" width="624" height="70" rx="35" fill="rgba(255,255,255,0.72)"/>
      <rect x="72" y="76" width="164" height="20" rx="10" fill="rgba(59,31,120,0.22)"/>
      <rect x="560" y="76" width="78" height="20" rx="10" fill="rgba(59,31,120,0.12)"/>
      <rect x="72" y="188" width="576" height="364" rx="40" fill="rgba(255,255,255,0.86)"/>
      <rect x="108" y="230" width="204" height="24" rx="12" fill="rgba(91,50,168,0.18)"/>
      <rect x="108" y="280" width="434" height="120" rx="28" fill="#FFFFFF"/>
      <rect x="108" y="432" width="208" height="72" rx="36" fill="${accent}"/>
      <text x="360" y="672" text-anchor="middle" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#1F1635">${title}</text>
      <text x="360" y="746" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="#4C4460">${subtitle}</text>
      <rect x="88" y="836" width="544" height="126" rx="38" fill="rgba(255,255,255,0.92)"/>
      <text x="360" y="914" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="#2F1B55">${cta}</text>
      <rect x="88" y="990" width="544" height="92" rx="34" fill="rgba(46,20,96,0.08)" stroke="rgba(46,20,96,0.18)" stroke-width="4"/>
      <text x="360" y="1048" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="#5B4C7E">Ikincil eylem</text>
      <rect x="248" y="1154" width="224" height="10" rx="5" fill="rgba(31,22,53,0.18)"/>
    </svg>
  `);

const mockScreens = [
  {
    id: "promo-popup",
    name: "Promosyon Pop-up",
    source: "Figma paste",
    device: "Mobil",
    url: createScreenSvg("#7C4DFF", "Ramazan Hediyesi", "Ilk gorunuste net mi?", "Hemen Katil"),
  },
  {
    id: "signup-sheet",
    name: "Kayit Alt Ekrani",
    source: "Figma paste",
    device: "Mobil",
    url: createScreenSvg("#5B8CFF", "Dakikalar Icinde Kayit", "Form alanlari guven veriyor mu?", "Kaydi Baslat"),
  },
  {
    id: "plan-compare",
    name: "Paket Karsilastirma",
    source: "Figma paste",
    device: "Desktop",
    url: createScreenSvg("#B48CFF", "Paketini Sec", "Karar vermek yeterince kolay mi?", "Devam Et"),
  },
];

const questionCards = [
  "Bu ekran ilk bakista ne anlatiyor?",
  "Katilimciyi en hizli hangi goreve yonlendirmeliyiz?",
  "Hangi metin veya buton guven duygusunu zedeliyor olabilir?",
  "Katilimci neyi yanlis anlayabilir ya da atlayabilir?",
];

const FigmaScreenShareMock = () => {
  const [activeScreenId, setActiveScreenId] = useState(mockScreens[0].id);
  const [objective, setObjective] = useState("Bu promosyon pop-up'inin ilk gorunuste ne kadar anlasildigini ve kullanicinin ana CTA'yi fark edip etmedigini olcmek istiyorum.");
  const [primaryTask, setPrimaryTask] = useState("Kullanicidan kampanyaya katilmak isteyip istemedigine karar vermesini ve uygun aksiyonu secmesini bekliyoruz.");
  const [targetUsers, setTargetUsers] = useState("Mobil bankacilik kullanan, kampanya ve cekilis deneyimine asina yetiskinler");

  const activeScreen = useMemo(
    () => mockScreens.find((screen) => screen.id === activeScreenId) ?? mockScreens[0],
    [activeScreenId]
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f4ff_0%,#ffffff_28%,#f6f6f8_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Ana sayfaya don
            </Link>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Badge className="rounded-full bg-brand-primary/12 px-3 py-1 text-brand-primary hover:bg-brand-primary/12">
                  Local Mock
                </Badge>
                <Badge variant="outline" className="rounded-full border-brand-primary/20 bg-white/80 text-text-secondary">
                  Screen-share preview
                </Badge>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-text-primary md:text-5xl">
                Figma ekran paylasimi icin canli mock
              </h1>
              <p className="max-w-3xl text-base leading-7 text-text-secondary md:text-lg">
                Bu yuzey backend bagimsizdir. Placeholder ekranlar ve usability intake ile screen-share deneyimini
                localhost'ta hizli iterate etmek icin hazirlandi.
              </p>
            </div>
          </div>

          <Button asChild className="rounded-full bg-brand-primary px-6 text-white hover:bg-brand-primary-hover">
            <a href="http://127.0.0.1:5173/mock/figma-screen-share" target="_self" rel="noreferrer">
              Bu mock'u acik tut
            </a>
          </Button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card className="overflow-hidden rounded-[32px] border border-border-light bg-white/92 shadow-[0_24px_64px_rgba(15,23,42,0.08)]">
            <CardHeader className="space-y-4 border-b border-border-light bg-[linear-gradient(180deg,rgba(124,77,255,0.08),rgba(255,255,255,0.8))]">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-primary/15 bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brand-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Figma intake
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl text-text-primary">Paste-first ekran girisi</CardTitle>
                <CardDescription className="text-sm leading-6 text-text-secondary">
                  Figma'dan kopyalanmis ekranlar Searcho'ya gelir. Burada sadece placeholder kullaniyoruz.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 p-6">
              <div className="rounded-[28px] border border-dashed border-brand-primary/35 bg-brand-primary/[0.04] p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-white p-3 shadow-sm">
                    <ImageIcon className="h-5 w-5 text-brand-primary" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-text-primary">Figma ekranini yapistir</p>
                    <p className="text-sm leading-6 text-text-secondary">
                      Bu local mock'ta gercek paste gerekmiyor. Asagidaki ekranlar placeholder olarak yuklu geldi.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-text-primary">Hazir ekranlar</p>
                  <Badge variant="outline" className="rounded-full">
                    {mockScreens.length} ekran
                  </Badge>
                </div>

                <div className="grid gap-3">
                  {mockScreens.map((screen) => (
                    <button
                      key={screen.id}
                      type="button"
                      onClick={() => setActiveScreenId(screen.id)}
                      className={`flex items-center gap-3 rounded-[24px] border p-3 text-left transition-all ${
                        activeScreen.id === screen.id
                          ? "border-brand-primary bg-brand-primary/[0.06] shadow-[0_12px_32px_rgba(124,77,255,0.12)]"
                          : "border-border-light bg-white hover:border-brand-primary/30 hover:bg-brand-primary/[0.03]"
                      }`}
                    >
                      <img src={screen.url} alt={screen.name} className="h-20 w-14 rounded-2xl border border-border-light object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-text-primary">{screen.name}</p>
                        <p className="text-sm text-text-secondary">{screen.source}</p>
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-text-secondary shadow-sm">
                        {screen.device}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 rounded-[28px] border border-border-light bg-[#faf9ff] p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <Layers3 className="h-4 w-4 text-brand-primary" />
                  Usability intake
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-muted">1. Objective</p>
                  <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} className="min-h-[90px] bg-white" />
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-muted">2. Primary task</p>
                  <Textarea value={primaryTask} onChange={(e) => setPrimaryTask(e.target.value)} className="min-h-[90px] bg-white" />
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-muted">3. Target users</p>
                  <Input value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} className="bg-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="overflow-hidden rounded-[36px] border border-border-light bg-white/92 shadow-[0_28px_80px_rgba(15,23,42,0.08)]">
              <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border-light bg-[linear-gradient(180deg,rgba(124,77,255,0.06),rgba(255,255,255,0.92))]">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brand-primary">
                    <Monitor className="h-3.5 w-3.5" />
                    Screen-share stage
                  </div>
                  <CardTitle className="text-2xl text-text-primary">{activeScreen.name}</CardTitle>
                  <CardDescription className="text-sm leading-6 text-text-secondary">
                    Burasi gorusmede katilimciya gosterilecek ekranin mock sahnesi. Boyut, hiza ve readability burada
                    tartisilabilir.
                  </CardDescription>
                </div>

                <div className="rounded-[28px] border border-border-light bg-white/90 px-4 py-3 text-sm text-text-secondary shadow-sm">
                  <p className="font-medium text-text-primary">Kaynak</p>
                  <p>{activeScreen.source}</p>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 p-6 md:p-8">
                <div className="rounded-[32px] border border-border-light bg-[radial-gradient(circle_at_top,rgba(124,77,255,0.1),transparent_40%),linear-gradient(180deg,#f8f7ff_0%,#f3f4f8_100%)] p-6 md:p-10">
                  <div className="mx-auto flex max-w-5xl flex-col items-center gap-8">
                    <div className="flex items-center gap-2 rounded-full bg-white/88 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-brand-primary shadow-sm">
                      <TabletSmartphone className="h-4 w-4" />
                      Placeholder share view
                    </div>

                    <img
                      src={activeScreen.url}
                      alt={activeScreen.name}
                      className="max-h-[70vh] w-auto max-w-full rounded-[34px] border border-border-light bg-white object-contain shadow-[0_32px_90px_rgba(59,31,120,0.18)]"
                    />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[28px] border border-border-light bg-[#fcfbff] p-5">
                    <div className="mb-4 flex items-center gap-2 text-sm font-medium text-text-primary">
                      <Link2 className="h-4 w-4 text-brand-primary" />
                      Mock clarity notes
                    </div>
                    <div className="space-y-3 text-sm leading-6 text-text-secondary">
                      <p>
                        Bu panelde aktif ekran buyuk ve ortali duruyor. Katilimcinin gorevi okumadan once ekranin kendi
                        kendini ne kadar anlattigi degerlendirilebilir.
                      </p>
                      <p>
                        Intake cevaplari sadece placeholder; istersen burada copy, spacing veya framing degisikliklerini
                        birlikte hizli iterate edebiliriz.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-border-light bg-white p-5">
                    <p className="mb-4 text-sm font-medium text-text-primary">Katilimciya sorulacak ornek sorular</p>
                    <div className="space-y-3">
                      {questionCards.map((question) => (
                        <div key={question} className="rounded-2xl border border-border-light bg-[#f8f7fb] px-4 py-3 text-sm text-text-primary">
                          {question}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FigmaScreenShareMock;
