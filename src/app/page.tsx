import Image from "next/image";
import { cookies } from "next/headers";
import {
  BookOpenText,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileSearch,
  Hammer,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { ProjectLauncher } from "@/components/projects/fixture-project-launcher";
import {
  loadCurrentAuthorizedProjectSnapshot,
  type ProjectSnapshot,
} from "@/lib/projects/project-snapshot";

const stages = [
  {
    title: "Set the teaching brief",
    description: "Define the learners, goals, and teaching approach.",
    icon: BookOpenText,
  },
  {
    title: "Ground it in sources",
    description: "Upload the trusted course material the tutor can use.",
    icon: FileSearch,
  },
  {
    title: "Build the course model",
    description: "Turn evidence into concepts, methods, and boundaries.",
    icon: Boxes,
  },
  {
    title: "Choose a tutor design",
    description: "Compare course-aware teaching personalities.",
    icon: Sparkles,
  },
  {
    title: "Build the tutor",
    description: "Compile the chosen approach into a working tutor.",
    icon: Hammer,
  },
  {
    title: "Evaluate quality",
    description: "Test helpfulness, boundaries, and answer protection.",
    icon: ClipboardCheck,
  },
  {
    title: "Preview the experience",
    description: "Try real course questions and refine the result.",
    icon: Eye,
  },
  {
    title: "Export with confidence",
    description: "Package the approved tutor when it is ready.",
    icon: Download,
  },
] as const;

export function LandingPage({
  resumableProject,
}: {
  resumableProject?: ProjectSnapshot | null;
}) {
  return (
    <main className="h-dvh overflow-hidden bg-background p-2 sm:p-4 lg:p-6">
      <div className="landing-frame mx-auto grid h-full w-full max-w-[90rem] grid-rows-[minmax(0,1.12fr)_minmax(0,0.88fr)] overflow-hidden rounded-[1.5rem] border bg-card shadow-[0_24px_80px_-32px_oklch(0.31_0.09_284.8/0.28)] sm:rounded-[2rem] lg:grid-cols-[minmax(0,1.06fr)_minmax(28rem,0.94fr)] lg:grid-rows-1">
        <section className="landing-hero flex min-h-0 flex-col justify-between px-6 py-6 sm:px-10 sm:py-8 lg:px-12 lg:py-8 xl:px-16">
          <Image
            src="/tutorlab-logo-transparent.png"
            alt="TutorLab"
            width={1161}
            height={250}
            priority
            className="landing-logo h-auto w-40 sm:w-48 xl:w-52"
          />

          <div className="landing-copy my-5 max-w-2xl sm:my-7 lg:my-4">
            <div className="landing-badge mb-4 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-accent/60 px-3 py-1.5 text-xs font-medium text-accent-foreground sm:text-sm">
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-primary"
              />
              Evidence-grounded from day one
            </div>
            <h1 className="landing-title max-w-2xl text-3xl font-semibold leading-[1.04] tracking-[-0.045em] text-balance sm:text-5xl xl:text-6xl">
              Build a tutor your course can trust.
            </h1>
            <p className="landing-description mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Shape an AI tutor around your materials, your teaching decisions,
              and the learning boundaries that matter.
            </p>
            <ProjectLauncher
              fixtureMode={process.env.TUTORLAB_FIXTURE_MODE === "1"}
              resumableProject={resumableProject}
            />
          </div>

          <p className="landing-footer hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <MessageSquareText
              aria-hidden="true"
              className="size-4 text-primary"
            />
            Designed for thoughtful, course-grounded learning.
          </p>
        </section>

        <aside className="landing-journey relative isolate min-h-0 overflow-hidden bg-primary px-5 py-5 text-primary-foreground sm:px-8 sm:py-7 lg:px-8 lg:py-8 xl:px-10">
          <div
            aria-hidden="true"
            className="absolute -top-32 -right-28 -z-10 size-96 rounded-full border-[5rem] border-white/5"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-28 -left-32 -z-10 size-80 rounded-full bg-white/5 blur-2xl"
          />

          <div className="mx-auto flex h-full max-w-2xl flex-col justify-center">
            <p className="journey-eyebrow font-mono text-xs font-semibold tracking-[0.18em] text-primary-foreground/65 uppercase">
              The TutorLab journey
            </p>
            <h2 className="journey-title mt-2 max-w-lg text-2xl font-semibold tracking-[-0.03em] text-balance sm:text-3xl">
              From raw material to ready-to-teach.
            </h2>
            <p className="journey-description mt-2 hidden max-w-lg text-sm leading-6 text-primary-foreground/72 sm:block">
              One guided workflow keeps evidence, teaching intent, and quality
              checks connected at every stage.
            </p>

            <ol
              className="journey-grid mt-4 grid min-h-0 grid-cols-2 gap-2 sm:mt-5"
              aria-label="Tutor building stages"
            >
              {stages.map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <li
                    key={stage.title}
                    className="journey-item group grid min-h-12 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.075] p-2 backdrop-blur-sm transition-colors duration-200 hover:bg-white/[0.12] sm:min-h-16 sm:grid-cols-[2.25rem_minmax(0,1fr)] sm:gap-3 sm:p-2.5"
                  >
                    <span className="journey-icon flex size-8 items-center justify-center rounded-lg bg-white/10 text-white shadow-sm ring-1 ring-white/10 sm:size-9">
                      <Icon
                        aria-hidden="true"
                        className="size-4 sm:size-[1.125rem]"
                        strokeWidth={1.8}
                      />
                    </span>
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="journey-item-title text-xs font-semibold leading-4 text-white sm:text-sm">
                          {stage.title}
                        </h3>
                        <span className="hidden font-mono text-[0.65rem] font-semibold text-white/45 sm:inline">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <p className="mt-0.5 hidden text-xs leading-4 text-primary-foreground/68 lg:block">
                        {stage.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default async function Home() {
  const editToken = (await cookies()).get("tutorlab_project_edit")?.value;
  const resumableProject = await loadCurrentAuthorizedProjectSnapshot(editToken);

  return <LandingPage resumableProject={resumableProject} />;
}
