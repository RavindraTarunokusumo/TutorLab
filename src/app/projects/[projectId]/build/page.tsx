import { renderProjectRoute } from "../project-route";

export default function BuildPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  return renderProjectRoute(props, "build");
}
