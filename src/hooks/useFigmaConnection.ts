import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FigmaConnectionState {
  connected: boolean;
  loading: boolean;
  connecting: boolean;
}

// Maps the `figma_error` codes the callback function redirects back with onto
// something a researcher can act on.
const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Figma bağlantısı iptal edildi.",
  expired_state: "Bağlantı isteğinin süresi doldu, tekrar deneyin.",
  unknown_state: "Bağlantı isteği doğrulanamadı, tekrar deneyin.",
  figma_not_configured: "Figma entegrasyonu yapılandırılmamış.",
};

/**
 * Read-only Figma account connection for the signed-in researcher. Tokens live
 * server-side only; this hook just reflects whether a connection exists and
 * kicks off the OAuth round trip.
 */
export const useFigmaConnection = () => {
  const [state, setState] = useState<FigmaConnectionState>({
    connected: false,
    loading: true,
    connecting: false,
  });

  const refresh = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setState((prev) => ({ ...prev, connected: false, loading: false }));
      return;
    }

    const { data, error } = await supabase.functions.invoke("figma-connect", {
      body: { action: "status" },
    });

    if (error) {
      setState((prev) => ({ ...prev, connected: false, loading: false }));
      return;
    }
    setState((prev) => ({ ...prev, connected: Boolean(data?.connected), loading: false }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The callback function bounces back to the app with ?figma=connected|failed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("figma");
    if (!result) return;

    if (result === "connected") {
      toast.success("Figma hesabınız bağlandı.");
      void refresh();
    } else {
      const reason = params.get("figma_error") ?? "";
      toast.error(ERROR_MESSAGES[reason] ?? "Figma bağlantısı kurulamadı.");
    }

    params.delete("figma");
    params.delete("figma_error");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [refresh]);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, connecting: true }));
    try {
      const { data, error } = await supabase.functions.invoke("figma-connect", {
        body: { action: "start", returnOrigin: window.location.origin + window.location.pathname },
      });
      if (error || !data?.url) {
        toast.error("Figma bağlantısı başlatılamadı.");
        setState((prev) => ({ ...prev, connecting: false }));
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Figma bağlantısı başlatılamadı.");
      setState((prev) => ({ ...prev, connecting: false }));
    }
  }, []);

  const disconnect = useCallback(async () => {
    await supabase.functions.invoke("figma-connect", { body: { action: "disconnect" } });
    setState((prev) => ({ ...prev, connected: false }));
    toast.success("Figma bağlantısı kaldırıldı.");
  }, []);

  return { ...state, connect, disconnect, refresh };
};
