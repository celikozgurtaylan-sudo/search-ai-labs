// Shared Figma prototype helpers.
// Kept in one place so the landing intake (src/pages/Index.tsx), the participant
// session (src/pages/StudySession.tsx) and the researcher usability panel
// (src/components/workspace/UsabilityPrototypePanel.tsx) all embed prototypes the
// same way.

/**
 * Wrap a Figma prototype/design URL in the share embed host so it can render
 * inside an iframe. This is the legacy `figma.com/embed?embed_host=share` form,
 * which works for prototypes shared with "anyone with the link".
 */
export const buildFigmaEmbedUrl = (url: string) =>
  `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;

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
 * Resolve the embeddable URL for a design screen: prefer a precomputed
 * `embedUrl`, otherwise build one for Figma-link screens. Returns null for
 * non-embeddable screens (e.g. pasted images).
 */
export const resolveDesignScreenEmbedUrl = (screen: DesignScreenLike | null | undefined): string | null => {
  if (!screen) return null;
  if (screen.embedUrl) return screen.embedUrl;
  if (screen.source === "figma-link" && screen.url) {
    return buildFigmaEmbedUrl(screen.url);
  }
  return null;
};

/** iframe `allow` permissions a live Figma prototype needs to be interactive. */
export const FIGMA_IFRAME_ALLOW = "fullscreen; clipboard-read; clipboard-write; autoplay";
