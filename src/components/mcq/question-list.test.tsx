import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionList } from "@/components/mcq/question-list";

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

const userId = "a".repeat(32);

const questions = [
	{
		id: "q1",
		name: "Times tables 7",
		question: "What is 7 × 8?",
		createdAt: "2026-10-14 10:00:00",
		updatedAt: "2026-10-14 10:00:00",
	},
	{
		id: "q2",
		name: "Capitals",
		question: "What is the capital of France?",
		createdAt: "2026-10-14 10:01:00",
		updatedAt: "2026-10-14 10:01:00",
	},
];

function mockQuestions(body: unknown, status = 200) {
	vi.mocked(fetch).mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	} as Response);
}

describe("QuestionList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("shows the table headers and each question's name and text", async () => {
		mockQuestions({ questions });

		render(<QuestionList userId={userId} />);

		await screen.findByRole("table");
		expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
		expect(screen.getByRole("columnheader", { name: "Question" })).toBeTruthy();
		expect(screen.getByRole("columnheader", { name: "Actions" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "Times tables 7" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "What is 7 × 8?" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "Capitals" })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "What is the capital of France?" })).toBeTruthy();
		expect(fetch).toHaveBeenCalledWith("/api/questions");
	});

	it("shows an empty state when there are no questions", async () => {
		mockQuestions({ questions: [] });

		render(<QuestionList userId={userId} />);

		expect(await screen.findByText("No questions yet. Create the first question.")).toBeTruthy();
	});

	it("links Create to the new-question page with userId", async () => {
		mockQuestions({ questions: [] });

		render(<QuestionList userId={userId} />);

		const create = await screen.findByRole("link", { name: "Create" });
		expect(create.getAttribute("href")).toBe(`/mcq/new?userId=${userId}`);
	});

	it("shows Edit, Preview, and Delete for every question and keeps userId on the links", async () => {
		const user = userEvent.setup();
		mockQuestions({ questions });

		render(<QuestionList userId={userId} />);

		await user.click(await screen.findByRole("button", { name: "Actions for Times tables 7" }));

		const edit = await screen.findByRole("menuitem", { name: "Edit" });
		const preview = screen.getByRole("menuitem", { name: "Preview" });
		expect(edit.getAttribute("href")).toBe(`/mcq/q1/edit?userId=${userId}`);
		expect(preview.getAttribute("href")).toBe(`/mcq/q1/preview?userId=${userId}`);
		expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
	});

	it("asks before deleting and only sends DELETE when confirmed", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ questions }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ ok: true }),
			} as Response);

		render(<QuestionList userId={userId} />);

		await user.click(await screen.findByRole("button", { name: "Actions for Times tables 7" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

		const dialog = await screen.findByRole("alertdialog");
		expect(within(dialog).getByText("Delete this question?")).toBeTruthy();
		expect(within(dialog).getByText("This also deletes its choices and answers.")).toBeTruthy();

		await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(screen.getByRole("cell", { name: "Times tables 7" })).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "Actions for Times tables 7" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
		await user.click(
			within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
		);

		await waitFor(() =>
			expect(fetch).toHaveBeenCalledWith("/api/questions/q1", { method: "DELETE" }),
		);
		await waitFor(() => expect(screen.queryByRole("cell", { name: "Times tables 7" })).toBeNull());
		expect(screen.getByRole("cell", { name: "Capitals" })).toBeTruthy();
	});

	it("asks the teacher to log in when userId is missing and does not fetch", () => {
		render(<QuestionList userId={null} />);

		expect(screen.getByText("Log in to see the questions.")).toBeTruthy();
		expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("keeps the logout control on the list", async () => {
		mockQuestions({ questions: [] });

		render(<QuestionList userId={userId} />);

		expect(await screen.findByRole("button", { name: "Log out" })).toBeTruthy();
	});
});
