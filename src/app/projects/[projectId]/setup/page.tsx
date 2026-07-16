import { renderProjectRoute } from "../project-route";

export default function SetupPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  return renderProjectRoute(props, "brief");
}
