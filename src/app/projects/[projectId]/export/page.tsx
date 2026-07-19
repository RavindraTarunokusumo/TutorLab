import { renderProjectRoute } from "../project-route";

export default function ExportPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  return renderProjectRoute(props, "export");
}
