import { renderProjectRoute } from "../project-route";

export default function CourseModelPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  return renderProjectRoute(props, "course_model");
}
