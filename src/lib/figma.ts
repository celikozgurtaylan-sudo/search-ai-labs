// Shared Figma prototype helpers.
// Kept in one place so the landing intake (src/pages/Index.tsx), the participant
// session (src/pages/StudySession.tsx) and the researcher usability panel
// (src/components/workspace/UsabilityPrototypePanel.tsx) all embed prototypes the
// same way.

// Prototype-URL params that hide Figma's own chrome inside the embed: the left
// "Flows" panel and the bottom bar with the file/board name. `hide-ui` hides the
// UI, `hotspot-hints` stops the blue click flashes, and the scaling params keep
// the frame fitted. Applied to the inner prototype URL so the embed viewer honors
// them.
const FIGMA_PROTO_EMBED_PARAMS: Record<string, string> = {
  "hide-ui": "1",
  "hotspot-hints": "0",
  "scaling": "scale-down",
  "content-scaling": "fixed",
};

/**
 * Wrap a Figma prototype/design URL in the share embed host so it can render
 * inside an iframe. This is the legacy `figma.com/embed?embed_host=share` form,
 * which works for prototypes shared with "anyone with the link". The inner
 * prototype URL is enriched with `hide-ui=1` etc. so the Figma chrome (flows
 * panel + board-name bar) stays hidden from researchers and participants.
 */
export const buildFigmaEmbedUrl = (url: string) => {
  let inner = url.trim();
  try {
    const parsed = new URL(inner);
    for (const [key, value] of Object.entries(FIGMA_PROTO_EMBED_PARAMS)) {
      parsed.searchParams.set(key, value);
    }
    inner = parsed.toString();
  } catch {
    // Leave the raw string as-is if it can't be parsed as a URL.
  }
  return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(inner)}`;
};

/**
 * True when the value looks like a Figma prototype/design/file URL.
 */
export const isFigmaPrototypeUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.hostname.endsWith("figma.com") && (
      url.pathname.includes("/proto/") ||
      url.pathname.includes("/design/") ||
      url.pathname.includes("/file/")
    );
  } catch {
    return false;
  }
};

/** Minimal shape shared across the design-screen consumers. */
export interface DesignScreenLike {
  name?: string;
  url?: string;
  source?: string;
  embedUrl?: string;
}

/**
 * Resolve the embeddable URL for a design screen. For Figma-link screens we
 * always rebuild from the raw `url` so the current embed params (hide-ui, etc.)
 * apply even to projects whose `embedUrl` was precomputed earlier. Returns null
 * for non-embeddable screens (e.g. pasted images).
 */
export const resolveDesignScreenEmbedUrl = (screen: DesignScreenLike | null | undefined): string | null => {
  if (!screen) return null;
  if (screen.source === "figma-link" && screen.url) {
    return buildFigmaEmbedUrl(screen.url);
  }
  return screen.embedUrl ?? null;
};

/** iframe `allow` permissions a live Figma prototype needs to be interactive. */
export const FIGMA_IFRAME_ALLOW = "fullscreen; clipboard-read; clipboard-write; autoplay";
