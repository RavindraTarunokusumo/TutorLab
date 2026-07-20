import { cookies } from "next/headers";
import { LandingPage } from "@/components/projects/landing-page";
import { getProjectEditTokens } from "@/lib/projects/auth";
import { loadAuthorizedProjectSnapshots } from "@/lib/projects/project-snapshot";

export default async function Home() {
  const editTokens = getProjectEditTokens((await cookies()).getAll());
  const resumableProjects = await loadAuthorizedProjectSnapshots(editTokens);

  return <LandingPage resumableProjects={resumableProjects} />;
}
