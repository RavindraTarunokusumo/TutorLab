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

type ProjectWorkspaceProps = {
  project: ProjectSnapshot;
  routeStage: ProjectStage;
};

function TutorScreen({
  projectId,
  routeStage,
}: {
  projectId: string;
  routeStage: Extract<ProjectStage, "design" | "build" | "report" | "preview">;
}) {
  if (routeStage === "design") {
    return <TutorDesignComparison projectId={projectId} />;
  }

  if (routeStage === "build") {
    return <BuildProgress projectId={projectId} />;
  }

  if (routeStage === "report") {
    return <EvaluationReport projectId={projectId} />;
  }

  return <PreviewStage projectId={projectId} />;
}

export function ProjectWorkspace({
  project,
  routeStage,
}: ProjectWorkspaceProps) {
  return (
    <main className="min-h-screen bg-background">
      <StageHeader
        projectId={project.id}
        currentStage={project.stage}
        lastCompletedStage={lastCompletedProjectStage(project.stage)}
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-8">
        <p className="mb-8 text-sm text-muted-foreground">
          Project: {project.name}
        </p>
        {routeStage === "brief" ? (
          <TeachingBriefWizard project={project} />
        ) : routeStage === "sources" ? (
          <SourceWorkspace projectId={project.id} />
        ) : routeStage === "course_model" ? (
          <CourseModelReview projectId={project.id} />
        ) : <TutorScreen projectId={project.id} routeStage={routeStage} />}
      </div>
    </main>
  );
}
