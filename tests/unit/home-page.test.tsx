import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("Home page", () => {
  it("introduces the TutorLab workspace", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "TutorLab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/build an evidence-grounded tutor/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create project" }),
    ).toBeInTheDocument();
  });
});
