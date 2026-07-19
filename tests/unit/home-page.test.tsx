import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("Home page", () => {
  it("introduces the TutorLab workspace", () => {
    render(<Home />);

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
});
