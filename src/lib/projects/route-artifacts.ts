import "server-only";
import { getCourseModelRepository } from "@/lib/analysis/course-synthesis";
import { getEvaluationRepository } from "@/lib/evaluation/repository";
import { getTutorRepository } from "@/lib/tutor/repository";

export type ProjectRouteArtifacts = {
  hasCourseModel: boolean;
  hasTutorDesign: boolean;
  hasActiveTutor: boolean;
  hasEvaluation: boolean;
};

export async function loadProjectRouteArtifacts(
  projectId: string,
): Promise<ProjectRouteArtifacts> {
  const courseModel = await getCourseModelRepository().findLatest(projectId);
  if (!courseModel) {
    return {
      hasCourseModel: false,
      hasTutorDesign: false,
      hasActiveTutor: false,
      hasEvaluation: false,
    };
  }

  const tutorRepository = getTutorRepository();
  const [designs, activeTutor] = await Promise.all([
    tutorRepository.listDesigns(projectId, courseModel.id),
    tutorRepository.findActiveVersion
      ? tutorRepository.findActiveVersion(projectId)
      : tutorRepository.findLatestVersion(projectId).then((version) =>
          version?.status === "ready" ? version : null,
        ),
  ]);
  const evaluation = activeTutor
    ? await getEvaluationRepository().findLatestRun(projectId, activeTutor.id)
    : null;

  return {
    hasCourseModel: true,
    hasTutorDesign: designs.length > 0,
    hasActiveTutor: Boolean(activeTutor),
    hasEvaluation: Boolean(evaluation),
  };
}
