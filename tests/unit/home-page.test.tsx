import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/app/page";

vi.mock("server-only", () => ({}));

describe("Home page", () => {
  it("introduces the TutorLab workspace", () => {
    render(<LandingPage />);

    expect(screen.getByRole("img", { name: "TutorLab" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Build a tutor your course can trust.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Tutor building stages" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(
      screen.getByRole("button", { name: "Create project" }),
    ).toBeInTheDocument();
  });

  it("shows the current browser-authorized project as resumable work", () => {
    render(
      <LandingPage
        resumableProjects={[
          {
            id: "fd87c251-f620-4bc1-aba5-d58104f80724",
            name: "Probability Course",
            stage: "preview",
            teachingBrief: {},
          },
        ]}
      />,
    );

    expect(screen.getByText("Probability Course")).toBeInTheDocument();
    expect(screen.getByText("Current stage: Preview")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      "/projects/fd87c251-f620-4bc1-aba5-d58104f80724/preview",
    );
  });
});
