import { renderProjectRoute } from "../project-route";

export default function DesignsPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  return renderProjectRoute(props, "design");
}
