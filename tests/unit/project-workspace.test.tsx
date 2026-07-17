import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ProjectWorkspace } from "@/components/projects/project-workspace";
import type { ProjectSnapshot } from "@/lib/projects/project-snapshot";

afterEach(cleanup);

const project: ProjectSnapshot = {
  id: "project-alpha",
  name: "Probability tutor",
  stage: "preview",
  teachingBrief: {},
};

describe("ProjectWorkspace", () => {
  it.each([
    ["brief", "Teaching brief"],
    ["sources", "Course sources"],
    ["course_model", "Course model"],
    ["design", "Tutor design comparison"],
    ["build", "Build evidence"],
    ["report", "Readiness report"],
    ["preview", "Tutor preview"],
  ] as const)("renders the %s route", (routeStage, heading) => {
    render(<ProjectWorkspace project={project} routeStage={routeStage} />);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("renders the live preview entry point without exposing token material", () => {
    const { container } = render(
      <ProjectWorkspace project={project} routeStage="preview" />,
    );

    expect(screen.getByRole("heading", { name: "Tutor preview" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Deterministic fixture preview/i);
    expect(container.textContent).not.toMatch(/edit[_ -]?token/i);
  });
});
