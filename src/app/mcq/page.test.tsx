import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import McqPage from "@/app/mcq/page";

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

describe("MCQ stub page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("says the question bank will be built later", () => {
		render(<McqPage />);

		expect(screen.getByText(/question bank will be built later/i)).toBeTruthy();
	});

	it("shows a logout control without a prior login", () => {
		render(<McqPage />);

		expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
	});
});
