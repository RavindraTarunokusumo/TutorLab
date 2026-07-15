import Link from "next/link";
import type { ProjectStage } from "@/lib/schemas/project";
import { fixturePreview } from "@/lib/projects/fixture-preview";
import type { ProjectSnapshot } from "@/lib/projects/project-snapshot";
import { lastCompletedProjectStage } from "@/lib/projects/stages";
import { StageHeader } from "./stage-header";
import { TeachingBriefWizard } from "./teaching-brief-wizard";

type ProjectWorkspaceProps = {
  project: ProjectSnapshot;
  routeStage: ProjectStage;
};

const routeLabels: Record<ProjectStage, string> = {
  brief: "Teaching brief",
  sources: "Course sources",
  course_model: "Course model",
  design: "Tutor design comparison",
  build: "Build evidence",
  report: "Readiness report",
  preview: "Tutor preview",
};

function FixtureNotice() {
  return (
    <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
      Deterministic fixture preview — no model or paid operations run on this
      screen.
    </p>
  );
}

function Placeholder({ routeStage }: { routeStage: ProjectStage }) {
  const followUp =
    routeStage === "brief"
      ? "The guided brief will be added in the next task."
      : routeStage === "sources"
        ? "Source upload and classification will be added in a later task."
        : "Course-model review and approval will be added in a later task.";

  return (
    <section className="max-w-2xl space-y-5 rounded-xl border bg-card p-6 shadow-sm">
      <p className="font-mono text-sm tracking-wide text-primary uppercase">
        Stage workspace
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        {routeLabels[routeStage]}
      </h1>
      <p className="leading-7 text-muted-foreground">{followUp}</p>
      <Link
        className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href="#next-task"
      >
        Continue when this stage is available
      </Link>
    </section>
  );
}

function FixtureScreen({
  routeStage,
}: {
  routeStage: Extract<ProjectStage, "design" | "build" | "report" | "preview">;
}) {
  const { courseModel, pipelineJob } = fixturePreview;

  if (routeStage === "design") {
    return (
      <section className="space-y-5">
        <FixtureNotice />
        <h1 className="text-3xl font-semibold tracking-tight">
          Tutor design comparison
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Three fixture-backed approaches for {courseModel.courseIdentity.title}
          .
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {["Socratic guide", "Exam coach", "Adaptive practice partner"].map(
            (name) => (
              <article
                key={name}
                className="rounded-xl border bg-card p-5 shadow-sm"
              >
                <h2 className="font-semibold">{name}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Grounds prompts in{" "}
                  {courseModel.concepts[0]?.name.toLowerCase()} and asks for
                  reasoning before calculation.
                </p>
              </article>
            ),
          )}
        </div>
      </section>
    );
  }

  if (routeStage === "build") {
    return (
      <section className="max-w-3xl space-y-5">
        <FixtureNotice />
        <h1 className="text-3xl font-semibold tracking-tight">
          Build evidence
        </h1>
        <article className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="font-medium">Course synthesis</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {pipelineJob.status === "completed"
              ? "Completed"
              : pipelineJob.status}{" "}
            at {Math.round(pipelineJob.progress * 100)}% from the deterministic
            pipeline job fixture.
          </p>
        </article>
      </section>
    );
  }

  if (routeStage === "report") {
    return (
      <section className="max-w-3xl space-y-5">
        <FixtureNotice />
        <h1 className="text-3xl font-semibold tracking-tight">
          Readiness report
        </h1>
        <article className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="font-medium">Evidence coverage</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {courseModel.coverage.analyzedCount} of{" "}
            {courseModel.coverage.documentCount} supplied documents were
            analyzed in the fixture model.
          </p>
        </article>
      </section>
    );
  }

  return (
    <section className="max-w-3xl space-y-5">
      <FixtureNotice />
      <h1 className="text-3xl font-semibold tracking-tight">Tutor preview</h1>
      <article className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="font-medium">
          Learner: Are mutually exclusive events independent?
        </p>
        <p className="mt-3 leading-7 text-muted-foreground">
          Tutor: Start by comparing what each relationship says about the
          intersection. What would you expect if the events were independent?
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Grounded in: {courseModel.concepts[0]?.name}
        </p>
      </article>
    </section>
  );
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
        ) : routeStage === "sources" ||
        routeStage === "course_model" ? (
          <Placeholder routeStage={routeStage} />
        ) : (
          <FixtureScreen routeStage={routeStage} />
        )}
      </div>
    </main>
  );
}
