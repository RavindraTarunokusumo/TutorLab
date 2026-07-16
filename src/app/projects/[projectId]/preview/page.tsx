import { renderProjectRoute } from "../project-route";

export default function PreviewPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  return renderProjectRoute(props, "preview");
}
