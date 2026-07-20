import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Download, ExternalLink, Loader2, MonitorPlay, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FIGMA_IFRAME_ALLOW, resolveDesignScreenEmbedUrl } from "@/lib/figma";
import { seedTasksFromFlows, type CompiledPrototype, type UsabilityTask } from "@/lib/prototype";
import { importFigmaPrototype, PrototypeImportError } from "@/services/prototypeImportService";
import { useFigmaConnection } from "@/hooks/useFigmaConnection";
import PrototypePlayer from "@/components/usability/PrototypePlayer";

export interface UsabilityDesignScreen {
  id?: string;
  name?: string;
  url: string;
  source?: string;
  embedUrl?: string;
}

interface UsabilityPrototypePanelProps {
  designScreens: UsabilityDesignScreen[];
  projectId?: string | null;
  /** Compiled prototype from figma-import, when the researcher has imported one. */
  prototype?: CompiledPrototype | null;
  tasks?: UsabilityTask[];
  onPrototypeImported?: (prototype: CompiledPrototype, tasks: UsabilityTask[]) => void;
  onTasksChange?: (tasks: UsabilityTask[]) => void;
  /** The existing StudyPanel (task list / participants / sessions) rendered beside the prototype. */
  children: ReactNode;
}

/**
 * Researcher-facing usability surface: the interactable prototype is the main
 * stage, with the study/task panel beside it. Used in place of the bare
 * StudyPanel for usability studies so the researcher sees (and can click
 * through) the screens instead of leading with the Searcho chat.
 *
 * Once the prototype is imported through the researcher's read-only Figma
 * connection we render Searcho's own player instead of the Figma embed — that's
 * what lets us mark a task complete when a participant reaches the goal screen
 * (Figma's embed emits no events for logged-out viewers). Until then we fall
 * back to the live embed, which stays usable but can't self-report progress.
 */
const UsabilityPrototypePanel = ({
  designScreens,
  projectId,
  prototype,
  tasks,
  onPrototypeImported,
  onTasksChange,
  children,
}: UsabilityPrototypePanelProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const figmaConnection = useFigmaConnection();

  const activeScreen = useMemo(
    () => designScreens[activeIndex] || designScreens[0] || null,
    [designScreens, activeIndex],
  );
  const embedUrl = resolveDesignScreenEmbedUrl(activeScreen);

  const figmaScreen = useMemo(
    () => designScreens.find((screen) => screen.source === "figma-link" && screen.url) ?? null,
    [designScreens],
  );

  const activeTask = useMemo(
    () => tasks?.find((task) => task.id === activeTaskId) ?? tasks?.[0] ?? null,
    [tasks, activeTaskId],
  );

  useEffect(() => {
    if (!activeTaskId && tasks?.length) setActiveTaskId(tasks[0].id);
  }, [activeTaskId, tasks]);

  const handleImport = async () => {
    if (!projectId || !figmaScreen?.url) return;
    setIsImporting(true);
    try {
      const compiled = await importFigmaPrototype(projectId, figmaScreen.url);
      const seeded = seedTasksFromFlows(compiled);
      onPrototypeImported?.(compiled, seeded);
      toast.success(`${compiled.frames.length} ekran içe aktarıldı.`);
    } catch (error) {
      toast.error(error instanceof PrototypeImportError ? error.message : "Prototip içe aktarılamadı.");
    } finally {
      setIsImporting(false);
    }
  };

  const setGoalFrame = (frameId: string) => {
    if (!activeTask || !tasks) return;
    onTasksChange?.(tasks.map((task) => (task.id === activeTask.id ? { ...task, goalFrameId: frameId } : task)));
    toast.success("Hedef ekran güncellendi.");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white lg:flex-row">
      {/* Prototype stage — the main surface */}
      <div className="flex min-h-0 flex-1 flex-col border-b border-border-light lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 border-b border-border-light bg-[linear-gradient(180deg,rgba(124,77,255,0.06),rgba(255,255,255,0.96))] px-5 py-4">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-primary">
            <MonitorPlay className="h-4 w-4 shrink-0 text-brand-primary" />
            <span className="truncate">{prototype ? activeTask?.title || "Prototip" : activeScreen?.name || "Prototip"}</span>
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

        {/* Import strip: turns the embed into a measurable Searcho-hosted player. */}
        {figmaScreen && projectId && !figmaConnection.loading ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light bg-surface/60 px-5 py-3">
            {prototype ? (
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {prototype.frames.length} ekran içe aktarıldı — görev tamamlanması otomatik ölçülüyor.
              </div>
            ) : (
              <p className="max-w-lg text-[11px] leading-5 text-text-secondary">
                Ekranları içe aktarın; Searcho prototipi kendi oynatıcısında gösterip katılımcı hedef ekrana
                ulaştığında görevi otomatik tamamlasın.
              </p>
            )}
            {figmaConnection.connected ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isImporting}
                onClick={() => void handleImport()}
                className="h-8 shrink-0 gap-2 text-xs"
              >
                {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {isImporting ? "İçe aktarılıyor…" : prototype ? "Yeniden içe aktar" : "Ekranları içe aktar"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={figmaConnection.connecting}
                onClick={() => void figmaConnection.connect()}
                className="h-8 shrink-0 gap-2 text-xs"
              >
                Figma'yı Bağla
              </Button>
            )}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_top,rgba(124,77,255,0.10),transparent_38%),linear-gradient(180deg,#f8f7ff_0%,#f2f4f8_100%)] p-4 md:p-6">
          {prototype && activeTask ? (
            <PrototypePlayer
              prototype={prototype}
              taskId={activeTask.id}
              startFrameId={activeTask.startFrameId}
              goalFrameId={activeTask.goalFrameId}
              className="w-full max-w-[420px]"
            />
          ) : embedUrl ? (
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

        {/* Goal-screen picker: which frame counts as "task done". */}
        {prototype && activeTask ? (
          <div className="border-t border-border-light bg-white px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-secondary">
                <Target className="h-3.5 w-3.5 text-brand-primary" />
                Hedef ekran
              </div>
              {(tasks?.length ?? 0) > 1
                ? tasks!.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setActiveTaskId(task.id)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        task.id === activeTask.id
                          ? "border-brand-primary bg-brand-primary/[0.08] text-brand-primary"
                          : "border-border-light text-text-secondary hover:border-brand-primary/30"
                      }`}
                    >
                      {task.title}
                    </button>
                  ))
                : null}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {prototype.frames.map((frame) => (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => setGoalFrame(frame.id)}
                  title={frame.name || frame.id}
                  className={`shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                    frame.id === activeTask.goalFrameId
                      ? "border-brand-primary"
                      : "border-transparent hover:border-brand-primary/30"
                  }`}
                >
                  <img src={frame.imageUrl} alt={frame.name || frame.id} className="h-20 w-auto object-cover" />
                </button>
              ))}
            </div>
          </div>
        ) : designScreens.length > 1 ? (
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
