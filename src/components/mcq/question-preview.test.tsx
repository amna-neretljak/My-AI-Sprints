import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionPreview } from "@/components/mcq/question-preview";

const userId = "a".repeat(32);
const questionId = "q1";
const choiceId1 = "c".repeat(32);
const choiceId2 = "d".repeat(32);

const storedQuestion = {
	id: questionId,
	name: "Times tables 7",
	question: "What is 7 × 8?",
	createdAt: "2026-10-14 10:00:00",
	updatedAt: "2026-10-14 10:00:00",
	choices: [
		{ id: choiceId2, text: "56", position: 1 },
		{ id: choiceId1, text: "54", position: 0 },
	],
};

function mockQuestion() {
	vi.mocked(fetch).mockResolvedValue({
		ok: true,
		status: 200,
		json: async () => ({ question: storedQuestion }),
	} as Response);
}

describe("QuestionPreview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("shows the name, question, and choices in position order without requesting answers", async () => {
		mockQuestion();

		render(<QuestionPreview userId={userId} questionId={questionId} />);

		expect(await screen.findByRole("heading", { name: "Times tables 7" })).toBeTruthy();
		expect(screen.getByText("What is 7 × 8?")).toBeTruthy();
		const radios = screen.getAllByRole("radio");
		expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual(["54", "56"]);
		expect(fetch).toHaveBeenCalledWith(`/api/questions/${questionId}`);
		expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).not.toContain("includeAnswers");
		expect(JSON.stringify(storedQuestion)).not.toContain("isCorrect");
	});

	it("keeps Submit disabled until a choice is selected", async () => {
		const user = userEvent.setup();
		mockQuestion();

		render(<QuestionPreview userId={userId} questionId={questionId} />);

		const submit = await screen.findByRole("button", { name: "Submit" });
		expect(submit).toHaveProperty("disabled", true);

		await user.click(screen.getByRole("radio", { name: "54" }));
		expect(submit).toHaveProperty("disabled", false);
	});

	it("records the selected choice and shows whether it was correct", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ question: storedQuestion }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({
					attempt: {
						id: "attempt-1",
						questionId,
						choiceId: choiceId1,
						isCorrect: false,
						createdAt: "2026-10-14 10:05:00",
					},
				}),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({
					attempt: {
						id: "attempt-2",
						questionId,
						choiceId: choiceId2,
						isCorrect: true,
						createdAt: "2026-10-14 10:06:00",
					},
				}),
			} as Response);

		render(<QuestionPreview userId={userId} questionId={questionId} />);

		await user.click(await screen.findByRole("radio", { name: "54" }));
		await user.click(screen.getByRole("button", { name: "Submit" }));

		expect((await screen.findByRole("status")).textContent).toBe("Incorrect answer. Try again.");
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
		expect(vi.mocked(fetch).mock.calls[1]).toEqual([
			`/api/questions/${questionId}/attempts`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId, choiceId: choiceId1 }),
			},
		]);
		expect(Object.keys(JSON.parse(vi.mocked(fetch).mock.calls[1]?.[1]?.body as string))).toEqual([
			"userId",
			"choiceId",
		]);

		await user.click(screen.getByRole("radio", { name: "56" }));
		await user.click(screen.getByRole("button", { name: "Submit" }));

		expect((await screen.findByRole("status")).textContent).toBe("Correct answer!");
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
		expect(JSON.parse(vi.mocked(fetch).mock.calls[2]?.[1]?.body as string)).toEqual({
			userId,
			choiceId: choiceId2,
		});
	});

	it("links back to the question list", async () => {
		mockQuestion();

		render(<QuestionPreview userId={userId} questionId={questionId} />);

		expect((await screen.findByRole("link", { name: "Back to questions" })).getAttribute("href")).toBe(
			`/mcq?userId=${userId}`,
		);
	});

	it("shows Question not found on a 404", async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: false,
			status: 404,
			json: async () => ({ error: "Question not found." }),
		} as Response);

		render(<QuestionPreview userId={userId} questionId={questionId} />);

		expect(await screen.findByText("Question not found.")).toBeTruthy();
	});

	it("asks the teacher to log in when userId is missing", () => {
		render(<QuestionPreview userId={null} questionId={questionId} />);

		expect(screen.getByText("Log in to see the questions.")).toBeTruthy();
		expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
		expect(fetch).not.toHaveBeenCalled();
	});
});
