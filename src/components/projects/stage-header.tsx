import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, CircleDot, LockKeyhole, Sparkles } from "lucide-react";
import { projectStageIndex, projectStages } from "@/lib/projects/stages";
import type { ProjectStage } from "@/lib/schemas/project";

type StageHeaderProps = {
  projectId: string;
  currentStage: ProjectStage;
  lastCompletedStage?: ProjectStage;
  projectName?: string;
};

export function StageHeader({
  projectId,
  currentStage,
  lastCompletedStage,
  projectName,
}: StageHeaderProps) {
  const currentIndex = projectStageIndex(currentStage);
  const completedIndex = lastCompletedStage
    ? projectStageIndex(lastCompletedStage)
    : currentIndex - 1;

  return (
    <header className="stage-header shrink-0 border-b border-primary/10 bg-card/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link
          href="/"
          aria-label="TutorLab home"
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Image
            src="/tutorlab-logo-transparent.png"
            alt="TutorLab"
            width={1161}
            height={250}
            priority
            className="h-auto w-32 sm:w-36"
          />
        </Link>
        <div className="min-w-0 text-right">
          <p className="flex items-center justify-end gap-1.5 font-mono text-[0.65rem] font-semibold tracking-[0.16em] text-primary uppercase">
            <Sparkles aria-hidden="true" className="size-3.5" />
            Tutor workspace
          </p>
          <p className="mt-1 truncate text-sm font-medium text-foreground">
            {projectName ?? "Course tutor project"}
          </p>
        </div>
      </div>
      <nav
        aria-label="Project progress"
        className="border-t border-primary/10 bg-accent/25"
      >
        <ol className="scrollbar-hidden mx-auto flex max-w-[90rem] gap-1 overflow-x-auto px-3 py-2 sm:px-7 lg:grid lg:grid-cols-8 lg:overflow-visible">
          {projectStages.map((item, index) => {
            const isCurrent = item.stage === currentStage;
            const isCompleted = index <= completedIndex;
            const isReachable = isCompleted || isCurrent;
            const accessibleLabel =
              item.stage === "course_model" ? "Course Model" : item.label;
            const stageStatus = isCurrent
              ? "Current stage"
              : isCompleted
                ? "Completed"
                : "Locked";
            const content = (
              <>
                {isCurrent ? (
                  <CircleDot aria-hidden="true" className="size-4 shrink-0" />
                ) : isCompleted ? (
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-4 shrink-0 text-emerald-600"
                  />
                ) : (
                  <LockKeyhole
                    aria-hidden="true"
                    className="size-4 shrink-0 text-red-600"
                  />
                )}
                <span className="min-w-0 truncate font-medium">
                  {item.label}
                </span>
              </>
            );

            return (
              <li key={item.stage} className="min-w-[7.5rem] flex-1 lg:min-w-0">
                {isReachable ? (
                  <Link
                    aria-label={`${accessibleLabel} — ${stageStatus}`}
                    aria-current={isCurrent ? "step" : undefined}
                    className="flex min-h-10 items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs transition-[background-color,color,box-shadow] duration-200 hover:bg-card aria-[current=step]:bg-primary aria-[current=step]:text-primary-foreground aria-[current=step]:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    href={`/projects/${projectId}/${item.href}`}
                  >
                    <span className="font-mono text-[0.65rem] opacity-60">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {content}
                  </Link>
                ) : (
                  <span
                    aria-label={`${accessibleLabel} — ${stageStatus}`}
                    aria-disabled="true"
                    className="flex min-h-10 items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground"
                  >
                    <span className="font-mono text-[0.65rem] opacity-60">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}
