import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageHeader } from "@/components/projects/stage-header";

describe("StageHeader", () => {
  it("marks completed and current stages, links only reachable stages, and keeps keyboard focus visible", () => {
    render(
      <StageHeader
        projectId="project-alpha"
        currentStage="design"
        lastCompletedStage="course_model"
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Project progress" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Brief.*Completed/i }),
    ).toHaveAttribute("href", "/projects/project-alpha/setup");
    expect(
      screen.getByRole("link", { name: /Course Model.*Completed/i }),
    ).toHaveAttribute("href", "/projects/project-alpha/course-model");
    expect(
      screen.getByRole("link", { name: /Design.*Current stage/i }),
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.queryByRole("link", { name: /Build/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Design.*Current stage/i }).className,
    ).toContain("focus-visible");
  });
});
