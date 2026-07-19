import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { ProjectAccessError } from "@/lib/projects/service";
import { loadAuthorizedProjectSnapshot } from "@/lib/projects/project-snapshot";
import { loadProjectRouteArtifacts } from "@/lib/projects/route-artifacts";
import { isProjectStageReachable } from "@/lib/projects/stages";
import { isFixtureRuntime } from "@/lib/fixture-runtime";
import type { ProjectStage } from "@/lib/schemas/project";
import { PROJECT_EDIT_COOKIE, projectEditCookieName } from "@/lib/projects/auth";

type ProjectRouteProps = {
  params: Promise<{ projectId: string }>;
};

export async function renderProjectRoute(
  { params }: ProjectRouteProps,
  routeStage: ProjectStage,
) {
  const { projectId } = await params;
  const cookieStore = await cookies();
  const editToken =
    cookieStore.get(projectEditCookieName(projectId))?.value ??
    cookieStore.get(PROJECT_EDIT_COOKIE)?.value;

  try {
    const project = await loadAuthorizedProjectSnapshot(projectId, editToken);
    if (!isFixtureRuntime()) {
      const artifacts = await loadProjectRouteArtifacts(project.id);
      if (!isProjectStageReachable(project.stage, routeStage, artifacts)) {
        notFound();
      }
    }
    return <ProjectWorkspace project={project} routeStage={routeStage} />;
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      notFound();
    }
    throw error;
  }
}
