import { renderProjectRoute } from "../project-route";

export default function SourcesPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  return renderProjectRoute(props, "sources");
}
