import Link from "next/link";
import { CheckCircle2, CircleDot, LockKeyhole } from "lucide-react";
import { projectStageIndex, projectStages } from "@/lib/projects/stages";
import type { ProjectStage } from "@/lib/schemas/project";

type StageHeaderProps = {
  projectId: string;
  currentStage: ProjectStage;
  lastCompletedStage?: ProjectStage;
};

export function StageHeader({
  projectId,
  currentStage,
  lastCompletedStage,
}: StageHeaderProps) {
  const currentIndex = projectStageIndex(currentStage);
  const completedIndex = lastCompletedStage
    ? projectStageIndex(lastCompletedStage)
    : currentIndex - 1;

  return (
    <nav aria-label="Project progress" className="border-b bg-card">
      <ol className="mx-auto grid max-w-7xl grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4 lg:grid-cols-7 lg:px-8">
        {projectStages.map((item, index) => {
          const isCurrent = item.stage === currentStage;
          const isCompleted = index <= completedIndex;
          const isReachable = isCompleted || isCurrent;
          const status = isCurrent
            ? "Current stage"
            : isCompleted
              ? "Completed"
              : "Locked";
          const content = (
            <>
              {isCurrent ? (
                <CircleDot aria-hidden="true" className="size-4 shrink-0" />
              ) : isCompleted ? (
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
              ) : (
                <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
              )}
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              <span className="text-xs text-muted-foreground">{status}</span>
            </>
          );

          return (
            <li key={item.stage}>
              {isReachable ? (
                <Link
                  aria-current={isCurrent ? "step" : undefined}
                  className="flex min-h-12 items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  href={`/projects/${projectId}/${item.href}`}
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex min-h-12 items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
