// Compiled-prototype model + pure player logic.
//
// A "compiled prototype" is what the figma-import edge function produces from a
// Figma file: each frame as a hosted PNG plus its click hotspots and the file's
// named flows. Searcho hosts its own player over this data so it can track which
// screen an anonymous participant is on (Figma's live embed can't — its events
// don't fire for logged-out viewers). The interaction logic lives here as a pure
// reducer so it's testable without a browser; PrototypePlayer.tsx is a thin view.

export interface PrototypeHotspot {
  /** Position/size in frame pixels, relative to the frame's top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  targetFrameId: string;
  trigger?: string; // e.g. "ON_CLICK"
}

export interface PrototypeFrame {
  id: string;
  name?: string;
  imageUrl: string;
  width: number;
  height: number;
  hotspots: PrototypeHotspot[];
}

export interface PrototypeFlow {
  name: string;
  startFrameId: string;
}

export interface CompiledPrototype {
  fileKey: string;
  startFrameId: string;
  frames: PrototypeFrame[];
  flows: PrototypeFlow[];
}

export interface UsabilityTask {
  id: string;
  title: string;
  instruction: string;
  startFrameId: string;
  goalFrameId: string;
  successType: "screen";
}

export interface TaskResult {
  taskId: string;
  reached: boolean;
  timeMs: number;
  clicks: number;
  misclicks: number;
  path: string[];
}

export const getFrame = (prototype: CompiledPrototype, frameId: string): PrototypeFrame | undefined =>
  prototype.frames.find((frame) => frame.id === frameId);

/**
 * Best-effort "goal" frame for a flow: walk the hotspot graph from the start and
 * prefer a reachable frame with no outgoing hotspots (a terminal screen), deepest
 * first. Falls back to the farthest reachable frame when the graph loops.
 */
export const findTerminalFrame = (prototype: CompiledPrototype, startFrameId: string): string => {
  const frameById = new Map(prototype.frames.map((frame) => [frame.id, frame]));
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startFrameId, depth: 0 }];
  let best = { id: startFrameId, depth: -1, terminal: false };

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const frame = frameById.get(id);
    if (!frame) continue;

    const outgoing = frame.hotspots.filter((hotspot) => frameById.has(hotspot.targetFrameId));
    const terminal = outgoing.length === 0;

    // Prefer terminal frames; among the same terminal-ness, prefer the deeper one.
    if ((terminal && !best.terminal) || (terminal === best.terminal && depth > best.depth)) {
      best = { id, depth, terminal };
    }

    for (const hotspot of outgoing) {
      if (!visited.has(hotspot.targetFrameId)) {
        queue.push({ id: hotspot.targetFrameId, depth: depth + 1 });
      }
    }
  }

  return best.id;
};

/** Seed one task per Figma flow (falling back to the prototype start frame). */
export const seedTasksFromFlows = (prototype: CompiledPrototype): UsabilityTask[] => {
  const flows = prototype.flows.length > 0
    ? prototype.flows
    : [{ name: "Görev 1", startFrameId: prototype.startFrameId }];

  return flows.map((flow, index) => ({
    id: `task-${index + 1}`,
    title: flow.name || `Görev ${index + 1}`,
    instruction: "",
    startFrameId: flow.startFrameId,
    goalFrameId: findTerminalFrame(prototype, flow.startFrameId),
    successType: "screen" as const,
  }));
};

// ---- Pure player session logic (used by PrototypePlayer via useReducer) ----

export interface PlayerState {
  taskId: string;
  currentFrameId: string;
  path: string[];
  clicks: number;
  misclicks: number;
  startedAt: number;
  reached: boolean;
  result: TaskResult | null;
}

export type PlayerAction =
  | { type: "reset"; taskId: string; startFrameId: string; now: number }
  | { type: "hotspot"; targetFrameId: string; goalFrameId?: string; now: number }
  | { type: "misclick" };

export const initPlayerState = (taskId: string, startFrameId: string, now: number): PlayerState => ({
  taskId,
  currentFrameId: startFrameId,
  path: [startFrameId],
  clicks: 0,
  misclicks: 0,
  startedAt: now,
  reached: false,
  result: null,
});

export const playerReducer = (state: PlayerState, action: PlayerAction): PlayerState => {
  switch (action.type) {
    case "reset":
      return initPlayerState(action.taskId, action.startFrameId, action.now);

    case "misclick":
      return { ...state, clicks: state.clicks + 1, misclicks: state.misclicks + 1 };

    case "hotspot": {
      const clicks = state.clicks + 1;
      const path = [...state.path, action.targetFrameId];
      const justReached = !state.reached && !!action.goalFrameId && action.targetFrameId === action.goalFrameId;

      return {
        ...state,
        currentFrameId: action.targetFrameId,
        path,
        clicks,
        reached: state.reached || justReached,
        result: justReached
          ? {
              taskId: state.taskId,
              reached: true,
              timeMs: action.now - state.startedAt,
              clicks,
              misclicks: state.misclicks,
              path,
            }
          : state.result,
      };
    }

    default:
      return state;
  }
};
