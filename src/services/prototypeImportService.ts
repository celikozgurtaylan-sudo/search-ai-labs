import { supabase } from "@/integrations/supabase/client";
import type { CompiledPrototype } from "@/lib/prototype";

// Errors the figma-import function returns, mapped to something the researcher
// can act on.
const IMPORT_ERROR_MESSAGES: Record<string, string> = {
  figma_not_connected: "Önce Figma hesabınızı bağlayın.",
  figma_token_expired: "Figma bağlantınızın süresi doldu, tekrar bağlanın.",
  figma_file_not_accessible: "Bağlı Figma hesabı bu dosyaya erişemiyor. Dosyanın sahibi olan hesapla bağlanın.",
  invalid_prototype_url: "Figma prototype linki okunamadı.",
  no_frames_found: "Bu dosyada içe aktarılabilecek ekran bulunamadı.",
  frame_render_failed: "Ekran görüntüleri alınamadı, tekrar deneyin.",
};

export class PrototypeImportError extends Error {
  code: string;
  constructor(code: string) {
    super(IMPORT_ERROR_MESSAGES[code] ?? "Prototip içe aktarılamadı.");
    this.code = code;
  }
}

/**
 * Pull a Figma prototype into Searcho's own player format. Runs server-side
 * under the researcher's read-only Figma connection; the compiled result is
 * persisted onto the project's `analysis.usabilityTesting.prototype`.
 */
export const importFigmaPrototype = async (
  projectId: string,
  prototypeUrl: string,
): Promise<CompiledPrototype> => {
  const { data, error } = await supabase.functions.invoke("figma-import", {
    body: { projectId, prototypeUrl },
  });

  if (error) {
    // Non-2xx responses surface as FunctionsHttpError; the body carries the code.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new PrototypeImportError(body?.error ?? "import_failed");
  }
  if (!data?.prototype) throw new PrototypeImportError("import_failed");

  return data.prototype as CompiledPrototype;
};
