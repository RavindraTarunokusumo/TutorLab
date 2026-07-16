import type { ProjectStage } from "@/lib/schemas/project";

export const projectStages = [
  { stage: "brief", label: "Brief", href: "setup" },
  { stage: "sources", label: "Sources", href: "sources" },
  { stage: "course_model", label: "Course Model", href: "course-model" },
  { stage: "design", label: "Design", href: "designs" },
  { stage: "build", label: "Build", href: "build" },
  { stage: "report", label: "Report", href: "report" },
  { stage: "preview", label: "Preview", href: "preview" },
] as const satisfies ReadonlyArray<{
  stage: ProjectStage;
  label: string;
  href: string;
}>;

export function projectStageIndex(stage: ProjectStage): number {
  return projectStages.findIndex((item) => item.stage === stage);
}

export function isProjectStageReachable(
  currentStage: ProjectStage,
  requestedStage: ProjectStage,
): boolean {
  return projectStageIndex(requestedStage) <= projectStageIndex(currentStage);
}

export function lastCompletedProjectStage(
  currentStage: ProjectStage,
): ProjectStage | undefined {
  return projectStages[projectStageIndex(currentStage) - 1]?.stage;
}
