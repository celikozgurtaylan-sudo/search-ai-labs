import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList } from "lucide-react";
import type { CompiledPrototype, TaskResult, UsabilityTask } from "@/lib/prototype";
import PrototypePlayer from "./PrototypePlayer";

interface UsabilityTaskRunnerProps {
  prototype: CompiledPrototype;
  tasks: UsabilityTask[];
  onTaskResult?: (result: TaskResult) => void;
  onAllTasksComplete?: () => void;
}

// How long the "task done" confirmation stays up before the next task starts.
const ADVANCE_DELAY_MS = 1600;

/**
 * Participant-facing task runner over the Searcho-hosted prototype. Because we
 * render the prototype ourselves we know which screen the participant is on, so
 * reaching a task's goal frame marks it complete automatically — no self-report
 * and no Figma embed events (which never fire for logged-out viewers).
 */
const UsabilityTaskRunner = ({
  prototype,
  tasks,
  onTaskResult,
  onAllTasksComplete,
}: UsabilityTaskRunnerProps) => {
  const [taskIndex, setTaskIndex] = useState(0);
  const [justCompleted, setJustCompleted] = useState(false);

  const task = tasks[taskIndex] ?? null;
  const isFinished = taskIndex >= tasks.length;

  const handleGoalReached = useCallback((result: TaskResult) => {
    onTaskResult?.(result);
    setJustCompleted(true);
  }, [onTaskResult]);

  // Hold the confirmation briefly so the participant sees the task landed,
  // then move on.
  useEffect(() => {
    if (!justCompleted) return;
    const timer = window.setTimeout(() => {
      setJustCompleted(false);
      setTaskIndex((index) => index + 1);
    }, ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [justCompleted]);

  useEffect(() => {
    if (isFinished) onAllTasksComplete?.();
    // Fire once when the last task lands; onAllTasksComplete may be inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinished]);

  if (isFinished) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="text-sm font-medium text-text-primary">Tüm görevler tamamlandı.</p>
        <p className="max-w-xs text-xs leading-5 text-text-secondary">
          Şimdi deneyiminizle ilgili birkaç kısa soruyu yanıtlayabilirsiniz.
        </p>
      </div>
    );
  }

  if (!task) return null;

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div className="rounded-2xl border border-brand-primary/20 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-brand-primary">
          <ClipboardList className="h-3.5 w-3.5" />
          Görev {taskIndex + 1} / {tasks.length}
        </div>
        <p className="mt-1.5 text-sm leading-6 text-text-primary">
          {task.instruction?.trim() || task.title}
        </p>
      </div>

      <div className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto">
        <PrototypePlayer
          prototype={prototype}
          taskId={task.id}
          startFrameId={task.startFrameId}
          goalFrameId={task.goalFrameId}
          onGoalReached={handleGoalReached}
          className="w-full max-w-[420px]"
        />

        {justCompleted ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-[24px] bg-white/85 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              <p className="text-sm font-medium text-text-primary">Görev tamamlandı</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default UsabilityTaskRunner;
