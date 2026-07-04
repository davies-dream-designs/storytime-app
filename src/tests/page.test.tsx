import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders the hero tagline", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: /brush like a beast/i })
    ).toBeInTheDocument();
  });

  it("invites visitors to join the waitlist", () => {
    render(<Home />);
    expect(screen.getAllByText(/waitlist/i).length).toBeGreaterThan(0);
  });
});
