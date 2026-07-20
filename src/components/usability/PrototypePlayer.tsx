import { useEffect, useReducer, useRef } from "react";
import {
  type CompiledPrototype,
  type TaskResult,
  getFrame,
  initPlayerState,
  playerReducer,
} from "@/lib/prototype";

interface PrototypePlayerProps {
  prototype: CompiledPrototype;
  startFrameId: string;
  goalFrameId?: string;
  taskId?: string;
  /** When false, renders the current frame without clickable hotspots (preview). */
  interactive?: boolean;
  onNavigate?: (frameId: string) => void;
  onGoalReached?: (result: TaskResult) => void;
  className?: string;
}

/**
 * Searcho-hosted prototype player: renders a frame image with transparent
 * hotspot overlays and navigates on click, so we always know the current screen
 * (and clicks / misclicks / time) — the basis for anonymous goal-screen
 * detection. Interaction logic lives in the pure reducer in src/lib/prototype.ts.
 */
const PrototypePlayer = ({
  prototype,
  startFrameId,
  goalFrameId,
  taskId = "task",
  interactive = true,
  onNavigate,
  onGoalReached,
  className,
}: PrototypePlayerProps) => {
  const [state, dispatch] = useReducer(
    playerReducer,
    undefined,
    () => initPlayerState(taskId, startFrameId, Date.now()),
  );
  const reportedRef = useRef(false);

  // Keep the latest callbacks in refs so the effects below depend only on state
  // changes — depending on the callbacks would refire every render when a caller
  // passes inline functions (a render loop).
  const onNavigateRef = useRef(onNavigate);
  const onGoalReachedRef = useRef(onGoalReached);
  onNavigateRef.current = onNavigate;
  onGoalReachedRef.current = onGoalReached;

  // Restart the session whenever the task (or its start frame) changes.
  useEffect(() => {
    reportedRef.current = false;
    dispatch({ type: "reset", taskId, startFrameId, now: Date.now() });
  }, [taskId, startFrameId]);

  useEffect(() => {
    onNavigateRef.current?.(state.currentFrameId);
  }, [state.currentFrameId]);

  useEffect(() => {
    if (state.reached && state.result && !reportedRef.current) {
      reportedRef.current = true;
      onGoalReachedRef.current?.(state.result);
    }
  }, [state.reached, state.result]);

  const frame = getFrame(prototype, state.currentFrameId);
  if (!frame) return null;

  return (
    <div className={className}>
      <div
        className="relative mx-auto w-full select-none overflow-hidden rounded-[12px] border border-border-light bg-white shadow-sm"
        style={{ maxWidth: frame.width, aspectRatio: `${frame.width} / ${frame.height}` }}
        onClick={interactive ? () => dispatch({ type: "misclick" }) : undefined}
        data-testid="proto-frame"
        data-frame-id={frame.id}
      >
        <img
          src={frame.imageUrl}
          alt={frame.name || frame.id}
          className="block h-full w-full object-cover"
          draggable={false}
        />
        {interactive &&
          frame.hotspots.map((hotspot, index) => (
            <button
              key={`${hotspot.targetFrameId}-${index}`}
              type="button"
              data-hotspot={hotspot.targetFrameId}
              aria-label="prototype hotspot"
              onClick={(event) => {
                event.stopPropagation();
                dispatch({
                  type: "hotspot",
                  targetFrameId: hotspot.targetFrameId,
                  goalFrameId,
                  now: Date.now(),
                });
              }}
              className="absolute cursor-pointer rounded-[4px] transition-colors hover:bg-brand-primary/10"
              style={{
                left: `${(hotspot.x / frame.width) * 100}%`,
                top: `${(hotspot.y / frame.height) * 100}%`,
                width: `${(hotspot.w / frame.width) * 100}%`,
                height: `${(hotspot.h / frame.height) * 100}%`,
              }}
            />
          ))}
      </div>
    </div>
  );
};

export default PrototypePlayer;
