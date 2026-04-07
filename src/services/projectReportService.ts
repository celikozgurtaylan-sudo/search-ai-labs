import { isDemoProjectId } from "@/lib/demoData";
import { supabase } from "@/integrations/supabase/client";
import { projectService } from "@/services/projectService";
import type { ProjectInterviewReport, ProjectReportSnapshot } from "@/types/projectReport";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const extractProjectReport = (analysis: unknown): ProjectInterviewReport | null => {
  if (!isRecord(analysis)) return null;

  const rawReport = analysis.report;
  if (!isRecord(rawReport)) return null;

  const status = rawReport.status;
  if (status !== "empty" && status !== "generating" && status !== "ready" && status !== "failed") {
    return null;
  }

  return rawReport as unknown as ProjectInterviewReport;
};

export const projectReportService = {
  async getProjectReport(projectId: string): Promise<ProjectReportSnapshot> {
    const project = await projectService.getProject(projectId);

    return {
      projectTitle: project?.title || "Araştırma Projesi",
      projectDescription: project?.description || "",
      report: extractProjectReport(project?.analysis ?? null),
    };
  },

  async generateProjectReport(
    projectId: string,
    options: { force?: boolean; sessionId?: string } = {},
  ): Promise<ProjectInterviewReport | null> {
    if (isDemoProjectId(projectId)) {
      return null;
    }

    const { data, error } = await supabase.functions.invoke("interview-analysis", {
      body: {
        projectId,
        sessionId: options.sessionId,
        force: options.force ?? true,
      },
    });

    if (error) {
      throw new Error(`Analiz üretilemedi: ${error.message}`);
    }

    return extractProjectReport({ report: data?.report ?? null });
  },
};
