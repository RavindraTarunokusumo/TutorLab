import { FixtureProjectLauncher } from "@/components/projects/fixture-project-launcher";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16 sm:px-10">
      <section className="max-w-2xl space-y-6">
        <p className="font-mono text-sm font-medium tracking-[0.16em] text-primary uppercase">
          Evidence-grounded tutor builder
        </p>
        <h1 className="text-5xl font-semibold tracking-tight text-balance sm:text-7xl">
          TutorLab
        </h1>
        <p className="max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
          Build an evidence-grounded tutor from the course materials and
          teaching decisions you trust.
        </p>
        {process.env.TUTORLAB_FIXTURE_MODE === "1" ? (
          <FixtureProjectLauncher />
        ) : null}
      </section>
    </main>
  );
}
