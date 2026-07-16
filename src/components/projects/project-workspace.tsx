import type { ProjectStage } from "@/lib/schemas/project";
import { fixturePreview } from "@/lib/projects/fixture-preview";
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

function FixtureNotice() {
  return (
    <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
      Deterministic fixture preview — no model or paid operations run on this
      screen.
    </p>
  );
}

function FixtureScreen({
  projectId,
  routeStage,
}: {
  projectId: string;
  routeStage: Extract<ProjectStage, "design" | "build" | "report" | "preview">;
}) {
  const { courseModel } = fixturePreview;

  if (routeStage === "design") {
    return <TutorDesignComparison projectId={projectId} />;
  }

  if (routeStage === "build") {
    return <BuildProgress projectId={projectId} />;
  }

  if (routeStage === "report") {
    return <section className="space-y-5"><FixtureNotice /><EvaluationReport projectId={projectId} /></section>;
  }

  return <section className="space-y-5"><FixtureNotice /><PreviewStage projectId={projectId} conceptName={courseModel.concepts[0]?.name} /></section>;
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
        ) : <FixtureScreen projectId={project.id} routeStage={routeStage} />}
      </div>
    </main>
  );
}
