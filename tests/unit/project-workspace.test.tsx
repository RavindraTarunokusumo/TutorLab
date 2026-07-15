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

  it("labels Day 3+ content as deterministic fixtures without exposing token material", () => {
    const { container } = render(
      <ProjectWorkspace project={project} routeStage="preview" />,
    );

    expect(
      screen.getByText(/Deterministic fixture preview/i),
    ).toBeInTheDocument();
    expect(container.textContent).toContain("Mutual exclusivity");
    expect(container.textContent).not.toMatch(/edit[_ -]?token/i);
  });
});
