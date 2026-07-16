import { renderProjectRoute } from "../project-route";

export default function ReportPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  return renderProjectRoute(props, "report");
}
