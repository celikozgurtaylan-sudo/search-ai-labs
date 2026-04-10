import {
  supabase,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "@/integrations/supabase/client";

export interface EdgeConversationEntry {
  role: "user" | "assistant";
  content: string;
}

export interface EdgeStreamEvent<TFinal = unknown> {
  event: "assistant_delta" | "final" | "error";
  data?: TFinal;
  delta?: string;
  error?: string;
}

const MAX_RECENT_TURNS = 6;
const MAX_SUMMARY_ITEMS = 8;
const MAX_SUMMARY_CHARS = 140;

const truncate = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;

export const buildCompactConversationPayload = (
  history: EdgeConversationEntry[],
) => {
  const normalized = history
    .map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: typeof entry.content === "string" ? entry.content.trim() : "",
    }))
    .filter((entry) => entry.content.length > 0);

  const recentHistory = normalized.slice(-MAX_RECENT_TURNS);
  const olderHistory = normalized.slice(0, -MAX_RECENT_TURNS);
  const summary = olderHistory
    .slice(-MAX_SUMMARY_ITEMS)
    .map((entry) =>
      `${entry.role === "user" ? "Kullanıcı" : "Asistan"}: ${truncate(entry.content, MAX_SUMMARY_CHARS)}`,
    )
    .join("\n");

  return {
    conversationHistory: recentHistory,
    conversationSummary: summary,
  };
};

export const streamEdgeFunction = async <TFinal>({
  functionName,
  body,
  onEvent,
}: {
  functionName: string;
  body: Record<string, unknown>;
  onEvent?: (event: EdgeStreamEvent<TFinal>) => void;
}) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_PUBLISHABLE_KEY,
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...body,
      stream: true,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Edge Function request failed: ${response.status}`;
    try {
      const errorPayload = await response.json();
      errorMessage = errorPayload?.error || errorPayload?.message || errorMessage;
    } catch {
      const errorText = await response.text();
      if (errorText) {
        errorMessage = errorText;
      }
    }
    throw new Error(errorMessage);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = (await response.json()) as TFinal;
    onEvent?.({ event: "final", data: json });
    return json;
  }

  if (!response.body) {
    throw new Error("Streaming response body not available");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalData: TFinal | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line) {
        const event = JSON.parse(line) as EdgeStreamEvent<TFinal>;
        onEvent?.(event);

        if (event.event === "error") {
          throw new Error(event.error || "Streaming request failed");
        }

        if (event.event === "final" && event.data) {
          finalData = event.data;
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      break;
    }
  }

  if (!finalData) {
    throw new Error("Streaming response completed without a final payload");
  }

  return finalData;
};
