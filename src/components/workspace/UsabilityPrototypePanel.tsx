import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink, MonitorPlay } from "lucide-react";
import { FIGMA_IFRAME_ALLOW, resolveDesignScreenEmbedUrl } from "@/lib/figma";

export interface UsabilityDesignScreen {
  id?: string;
  name?: string;
  url: string;
  source?: string;
  embedUrl?: string;
}

interface UsabilityPrototypePanelProps {
  designScreens: UsabilityDesignScreen[];
  /** The existing StudyPanel (task list / participants / sessions) rendered beside the prototype. */
  children: ReactNode;
}

/**
 * Researcher-facing usability surface: the interactable Figma prototype is the
 * main stage, with the study/task panel beside it. Used in place of the bare
 * StudyPanel for usability studies so the researcher sees (and can click
 * through) the screens instead of leading with the Searcho chat.
 */
const UsabilityPrototypePanel = ({ designScreens, children }: UsabilityPrototypePanelProps) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const activeScreen = useMemo(
    () => designScreens[activeIndex] || designScreens[0] || null,
    [designScreens, activeIndex],
  );
  const embedUrl = resolveDesignScreenEmbedUrl(activeScreen);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white lg:flex-row">
      {/* Prototype stage — the main surface */}
      <div className="flex min-h-0 flex-1 flex-col border-b border-border-light lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 border-b border-border-light bg-[linear-gradient(180deg,rgba(124,77,255,0.06),rgba(255,255,255,0.96))] px-5 py-4">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-primary">
            <MonitorPlay className="h-4 w-4 shrink-0 text-brand-primary" />
            <span className="truncate">{activeScreen?.name || "Prototip"}</span>
          </div>
          {activeScreen?.url ? (
            <a
              href={activeScreen.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-brand-primary/20 bg-white px-3 py-1.5 text-xs font-medium text-brand-primary shadow-sm hover:border-brand-primary/40"
            >
              Yeni sekmede aç
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(124,77,255,0.10),transparent_38%),linear-gradient(180deg,#f8f7ff_0%,#f2f4f8_100%)] p-4 md:p-6">
          {embedUrl ? (
            <iframe
              title={activeScreen?.name || "Figma prototype"}
              src={embedUrl}
              className="h-full min-h-[420px] w-full rounded-[20px] border border-border-light bg-white shadow-[0_20px_60px_rgba(15,23,42,0.10)]"
              allow={FIGMA_IFRAME_ALLOW}
              allowFullScreen
            />
          ) : activeScreen?.url ? (
            <img
              src={activeScreen.url}
              alt={activeScreen?.name || "Design screen"}
              className="max-h-full max-w-full rounded-[20px] border border-border-light bg-white object-contain shadow-[0_20px_60px_rgba(15,23,42,0.12)]"
            />
          ) : (
            <div className="max-w-sm text-center text-sm leading-6 text-text-secondary">
              Henüz prototip ekranı eklenmedi. Figma prototip linkini araştırma kurulumunda ekleyin.
            </div>
          )}
        </div>

        {designScreens.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto border-t border-border-light bg-white px-4 py-3">
            {designScreens.map((screen, index) => (
              <button
                key={screen.id || `${screen.url}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  index === activeIndex
                    ? "border-brand-primary bg-brand-primary/[0.08] text-brand-primary"
                    : "border-border-light bg-white text-text-secondary hover:border-brand-primary/30"
                }`}
              >
                {screen.name || `Ekran ${index + 1}`}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Study / task side */}
      <div className="flex min-h-0 w-full flex-col overflow-hidden lg:w-[42%] lg:max-w-[600px]">
        {children}
      </div>
    </div>
  );
};

export default UsabilityPrototypePanel;
