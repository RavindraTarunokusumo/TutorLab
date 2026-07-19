import type { ProjectStage } from "@/lib/schemas/project";
import type { ProjectSnapshot } from "@/lib/projects/project-snapshot";
import { lastCompletedProjectStage } from "@/lib/projects/stages";
import { StageHeader } from "./stage-header";
import { TeachingBriefWizard } from "./teaching-brief-wizard";
import { SourceWorkspace } from "@/components/sources/source-workspace";
import { CourseModelReview } from "@/components/course-model/course-model-review";
import { TutorDesignComparison } from "@/components/tutor-design/tutor-design-comparison";
import { PreviewStage } from "@/components/chat/preview-stage";
import { BuildProgress } from "@/components/build-progress/build-progress";
import { EvaluationReport } from "@/components/evaluation/evaluation-report";
import { StandaloneTutorExport } from "@/components/export/standalone-tutor-export";

type ProjectWorkspaceProps = {
  project: ProjectSnapshot;
  routeStage: ProjectStage;
};

function TutorScreen({
  projectId,
  projectName,
  routeStage,
}: {
  projectId: string;
  projectName: string;
  routeStage: Extract<ProjectStage, "design" | "build" | "report" | "preview" | "export">;
}) {
  if (routeStage === "design") {
    return <TutorDesignComparison projectId={projectId} />;
  }

  if (routeStage === "build") {
    return <BuildProgress projectId={projectId} projectName={projectName} />;
  }

  if (routeStage === "report") {
    return <EvaluationReport projectId={projectId} />;
  }

  if (routeStage === "export") {
    return <StandaloneTutorExport projectId={projectId} />;
  }

  return <PreviewStage projectId={projectId} />;
}

export function ProjectWorkspace({
  project,
  routeStage,
}: ProjectWorkspaceProps) {
  const preview = routeStage === "preview";
  return (
    <main className={preview ? "flex h-dvh flex-col overflow-hidden bg-background" : "min-h-screen bg-background"}>
      <StageHeader
        projectId={project.id}
        currentStage={project.stage}
        lastCompletedStage={lastCompletedProjectStage(project.stage)}
      />
      <div className={routeStage === "build" ? "w-full" : preview ? "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-8" : "mx-auto w-full max-w-7xl px-4 py-10 sm:px-8"}>
        {routeStage !== "build" ? <p className="mb-8 text-sm text-muted-foreground">
          Project: {project.name}
        </p> : null}
        {routeStage === "brief" ? (
          <TeachingBriefWizard project={project} />
        ) : routeStage === "sources" ? (
          <SourceWorkspace projectId={project.id} />
        ) : routeStage === "course_model" ? (
          <CourseModelReview projectId={project.id} />
        ) : preview ? <div className="min-h-0 flex-1"><TutorScreen projectId={project.id} projectName={project.name} routeStage={routeStage} /></div> : <TutorScreen projectId={project.id} projectName={project.name} routeStage={routeStage} />}
      </div>
    </main>
  );
}
