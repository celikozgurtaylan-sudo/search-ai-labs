// Pure Figma-document -> Searcho-prototype compilation.
//
// Kept free of imports and I/O so it can be exercised directly; figma-import
// wraps it with auth, the Figma REST calls and frame-image storage.

export interface Hotspot {
  /** Frame-local pixels, relative to the frame's top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  targetFrameId: string;
  trigger?: string;
}

export interface FrameDraft {
  id: string;
  name: string;
  width: number;
  height: number;
  hotspots: Hotspot[];
}

export interface WalkResult {
  frames: FrameDraft[];
  flows: Array<{ name: string; startFrameId: string }>;
  documentStartFrameId: string | null;
}

type FigmaNode = Record<string, any>;

/** Figma prototype/design/file URLs all carry the key as /<kind>/<key>/<slug>. */
export const parseFigmaUrl = (raw: string): { fileKey: string; nodeId: string | null } | null => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!url.hostname.endsWith("figma.com")) return null;

  const match = url.pathname.match(/\/(?:proto|design|file|board)\/([A-Za-z0-9]+)/);
  if (!match) return null;

  // Figma writes node ids as "1-23" in URLs but "1:23" everywhere in the API.
  const rawNodeId = url.searchParams.get("node-id");
  const nodeId = rawNodeId ? rawNodeId.replace(/-/g, ":") : null;

  return { fileKey: match[1], nodeId };
};

/** Every navigation destination a node's prototype reactions point at. */
const collectDestinations = (node: FigmaNode): Array<{ destinationId: string; trigger?: string }> => {
  const out: Array<{ destinationId: string; trigger?: string }> = [];

  for (const reaction of Array.isArray(node.reactions) ? node.reactions : []) {
    const actions = Array.isArray(reaction.actions)
      ? reaction.actions
      : reaction.action
      ? [reaction.action]
      : [];
    for (const action of actions) {
      if (typeof action?.destinationId === "string") {
        out.push({ destinationId: action.destinationId, trigger: reaction.trigger?.type });
      }
    }
  }

  // Older files expose the destination directly on the node instead.
  if (out.length === 0 && typeof node.transitionNodeID === "string") {
    out.push({ destinationId: node.transitionNodeID });
  }

  return out;
};

/**
 * Walk a frame's subtree, turning every node with a navigation reaction into a
 * hotspot rect expressed in frame-local pixels.
 */
export const collectHotspots = (frame: FigmaNode): Hotspot[] => {
  const origin = frame.absoluteBoundingBox;
  if (!origin) return [];

  const hotspots: Hotspot[] = [];
  const seen = new Set<string>();
  const stack: FigmaNode[] = Array.isArray(frame.children) ? [...frame.children] : [];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (Array.isArray(node.children)) stack.push(...node.children);

    const box = node.absoluteBoundingBox;
    if (!box) continue;

    for (const { destinationId, trigger } of collectDestinations(node)) {
      const key = `${node.id}->${destinationId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      hotspots.push({
        x: Math.round(box.x - origin.x),
        y: Math.round(box.y - origin.y),
        w: Math.round(box.width),
        h: Math.round(box.height),
        targetFrameId: destinationId,
        trigger,
      });
    }
  }

  return hotspots;
};

/** Top-level frames on every canvas, plus the file's named prototype flows. */
export const walkDocument = (document: FigmaNode): WalkResult => {
  const frames: FrameDraft[] = [];
  const flows: Array<{ name: string; startFrameId: string }> = [];
  let documentStartFrameId: string | null = null;

  for (const canvas of Array.isArray(document.children) ? document.children : []) {
    if (canvas.type !== "CANVAS") continue;

    for (const point of Array.isArray(canvas.flowStartingPoints) ? canvas.flowStartingPoints : []) {
      if (typeof point?.nodeId === "string") {
        flows.push({ name: point.name || `Akış ${flows.length + 1}`, startFrameId: point.nodeId });
      }
    }
    if (!documentStartFrameId && typeof canvas.prototypeStartNodeID === "string") {
      documentStartFrameId = canvas.prototypeStartNodeID;
    }

    for (const node of Array.isArray(canvas.children) ? canvas.children : []) {
      if (node.type !== "FRAME" && node.type !== "COMPONENT") continue;
      const box = node.absoluteBoundingBox;
      if (!box?.width || !box?.height) continue;

      frames.push({
        id: node.id,
        name: node.name ?? "",
        width: Math.round(box.width),
        height: Math.round(box.height),
        hotspots: collectHotspots(node),
      });
    }
  }

  return { frames, flows, documentStartFrameId };
};

/**
 * Keep only frames reachable from the start (plus the start itself), so a design
 * file full of scratch frames doesn't drag hundreds of screens into the player.
 */
export const reachableFrames = (frames: FrameDraft[], startFrameId: string, maxFrames: number): FrameDraft[] => {
  const byId = new Map(frames.map((frame) => [frame.id, frame]));
  if (!byId.has(startFrameId)) return frames.slice(0, maxFrames);

  const keep = new Set<string>();
  const queue = [startFrameId];
  while (queue.length > 0 && keep.size < maxFrames) {
    const id = queue.shift()!;
    if (keep.has(id)) continue;
    keep.add(id);
    for (const hotspot of byId.get(id)?.hotspots ?? []) {
      if (byId.has(hotspot.targetFrameId) && !keep.has(hotspot.targetFrameId)) {
        queue.push(hotspot.targetFrameId);
      }
    }
  }

  return frames.filter((frame) => keep.has(frame.id));
};

/** Pick the frame a prototype run should start on, preferring the pasted URL's node. */
export const resolveStartFrameId = (
  frames: FrameDraft[],
  candidates: Array<string | null | undefined>,
): string => {
  const known = new Set(frames.map((frame) => frame.id));
  return candidates.find((candidate) => candidate && known.has(candidate)) ?? frames[0].id;
};
