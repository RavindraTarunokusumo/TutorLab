import Image from "next/image";
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

export default function Home() {
  return (
    <main className="min-h-dvh bg-background px-4 py-4 sm:px-6 sm:py-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-[90rem] overflow-hidden rounded-[2rem] border bg-card shadow-[0_24px_80px_-32px_oklch(0.31_0.09_284.8/0.28)] sm:min-h-[calc(100dvh-3rem)] lg:grid-cols-[minmax(0,1.06fr)_minmax(28rem,0.94fr)]">
        <section className="flex flex-col justify-between px-6 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12 xl:px-20">
          <Image
            src="/tutorlab-logo-transparent.png"
            alt="TutorLab"
            width={1161}
            height={250}
            priority
            className="h-auto w-48 sm:w-56"
          />

          <div className="my-14 max-w-2xl lg:my-10">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-accent/60 px-3.5 py-2 text-sm font-medium text-accent-foreground">
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-primary"
              />
              Evidence-grounded from day one
            </div>
            <h1 className="max-w-2xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-balance sm:text-6xl xl:text-7xl">
              Build a tutor your course can trust.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Shape an AI tutor around your materials, your teaching decisions,
              and the learning boundaries that matter.
            </p>
            <ProjectLauncher
              fixtureMode={process.env.TUTORLAB_FIXTURE_MODE === "1"}
            />
          </div>

          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquareText
              aria-hidden="true"
              className="size-4 text-primary"
            />
            Designed for thoughtful, course-grounded learning.
          </p>
        </section>

        <aside className="relative isolate overflow-hidden bg-primary px-6 py-10 text-primary-foreground sm:px-10 lg:px-12 lg:py-12 xl:px-16">
          <div
            aria-hidden="true"
            className="absolute -top-32 -right-28 -z-10 size-96 rounded-full border-[5rem] border-white/5"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-28 -left-32 -z-10 size-80 rounded-full bg-white/5 blur-2xl"
          />

          <div className="mx-auto flex h-full max-w-xl flex-col justify-center">
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-primary-foreground/65 uppercase">
              The TutorLab journey
            </p>
            <h2 className="mt-4 max-w-md text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
              From raw material to ready-to-teach.
            </h2>
            <p className="mt-4 max-w-lg leading-7 text-primary-foreground/72">
              One guided workflow keeps evidence, teaching intent, and quality
              checks connected at every stage.
            </p>

            <ol className="mt-8 grid gap-2" aria-label="Tutor building stages">
              {stages.map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <li
                    key={stage.title}
                    className="group grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 rounded-2xl border border-white/10 bg-white/[0.075] p-3 backdrop-blur-sm transition-colors duration-200 hover:bg-white/[0.12]"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-white shadow-sm ring-1 ring-white/10">
                      <Icon
                        aria-hidden="true"
                        className="size-5"
                        strokeWidth={1.8}
                      />
                    </span>
                    <div>
                      <div className="flex items-baseline justify-between gap-4">
                        <h3 className="font-semibold text-white">
                          {stage.title}
                        </h3>
                        <span className="font-mono text-xs font-semibold text-white/45">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-5 text-primary-foreground/68">
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
