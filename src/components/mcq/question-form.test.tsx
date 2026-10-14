import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRouter } from "next/navigation";
import { QuestionForm } from "@/components/mcq/question-form";

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}));

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
		{ id: choiceId1, text: "54", position: 0, isCorrect: false },
		{ id: choiceId2, text: "56", position: 1, isCorrect: true },
	],
};

function mockRouter() {
	const push = vi.fn();
	vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
	return push;
}

async function fillValidCreate(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText("Name"), "Times tables 7");
	await user.type(screen.getByLabelText("Question"), "What is 7 × 8?");
	await user.type(screen.getByLabelText("Choice 1"), "54");
	await user.type(screen.getByLabelText("Choice 2"), "56");
	await user.click(screen.getByRole("radio", { name: "Mark choice 2 as correct" }));
}

describe("QuestionForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
		mockRouter();
	});

	it("has a Name field and a Question field, and no Description field", () => {
		render(<QuestionForm userId={userId} />);

		expect(screen.getByLabelText("Name")).toBeTruthy();
		expect(screen.getByLabelText("Question")).toBeTruthy();
		expect(screen.queryByLabelText("Description")).toBeNull();
	});

	it("starts with 2 choice rows, stops adding at 6, and disables remove at 2", async () => {
		const user = userEvent.setup();
		render(<QuestionForm userId={userId} />);

		expect(screen.getByLabelText("Choice 1")).toBeTruthy();
		expect(screen.getByLabelText("Choice 2")).toBeTruthy();
		expect(screen.queryByLabelText("Choice 3")).toBeNull();
		expect(screen.getByRole("button", { name: "Remove choice 1" })).toHaveProperty("disabled", true);

		const add = screen.getByRole("button", { name: "Add choice" });
		await user.click(add);
		await user.click(add);
		await user.click(add);
		await user.click(add);
		expect(screen.getByLabelText("Choice 6")).toBeTruthy();
		expect(add).toHaveProperty("disabled", true);

		expect(screen.getByRole("button", { name: "Remove choice 1" })).toHaveProperty("disabled", false);
	});

	it("shows Enter the question and does not submit when the question is empty", async () => {
		const user = userEvent.setup();
		render(<QuestionForm userId={userId} />);

		await user.type(screen.getByLabelText("Name"), "Times tables 7");
		await user.type(screen.getByLabelText("Choice 1"), "54");
		await user.type(screen.getByLabelText("Choice 2"), "56");
		await user.click(screen.getByRole("radio", { name: "Mark choice 2 as correct" }));
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect((await screen.findByRole("alert")).textContent).toBe("Enter the question.");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("shows Mark the correct answer and does not submit when none is marked", async () => {
		const user = userEvent.setup();
		render(<QuestionForm userId={userId} />);

		await user.type(screen.getByLabelText("Name"), "Times tables 7");
		await user.type(screen.getByLabelText("Question"), "What is 7 × 8?");
		await user.type(screen.getByLabelText("Choice 1"), "54");
		await user.type(screen.getByLabelText("Choice 2"), "56");
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect((await screen.findByRole("alert")).textContent).toBe("Mark the correct answer.");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("saves a valid question and returns to the list", async () => {
		const user = userEvent.setup();
		const push = mockRouter();
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ question: storedQuestion }),
		} as Response);

		render(<QuestionForm userId={userId} />);
		await fillValidCreate(user);
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		expect(fetch).toHaveBeenCalledWith("/api/questions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				userId,
				name: "Times tables 7",
				question: "What is 7 × 8?",
				choices: [
					{ text: "54", isCorrect: false },
					{ text: "56", isCorrect: true },
				],
			}),
		});
		expect(push).toHaveBeenCalledWith(`/mcq?userId=${userId}`);
	});

	it("shows a 400 error from the server", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue({
			ok: false,
			status: 400,
			json: async () => ({ error: "Invalid question." }),
		} as Response);

		render(<QuestionForm userId={userId} />);
		await fillValidCreate(user);
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect((await screen.findByRole("alert")).textContent).toBe("Invalid question.");
	});

	it("cancels to the list without saving", async () => {
		const user = userEvent.setup();
		const push = mockRouter();

		render(<QuestionForm userId={userId} />);
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(push).toHaveBeenCalledWith(`/mcq?userId=${userId}`);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("loads an existing question and saves with the choice ids", async () => {
		const user = userEvent.setup();
		const push = mockRouter();
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ question: storedQuestion }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ question: storedQuestion }),
			} as Response);

		render(<QuestionForm userId={userId} questionId={questionId} />);

		expect(await screen.findByDisplayValue("Times tables 7")).toBeTruthy();
		expect(screen.getByDisplayValue("What is 7 × 8?")).toBeTruthy();
		expect(screen.getByDisplayValue("54")).toBeTruthy();
		expect(screen.getByDisplayValue("56")).toBeTruthy();
		expect(screen.getByRole("radio", { name: "Mark choice 2 as correct" }).getAttribute("aria-checked")).toBe(
			"true",
		);
		expect(fetch).toHaveBeenCalledWith(`/api/questions/${questionId}?includeAnswers=true`);

		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
		const update = vi.mocked(fetch).mock.calls[1];
		expect(update?.[0]).toBe(`/api/questions/${questionId}`);
		expect(update?.[1]).toEqual({
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Times tables 7",
				question: "What is 7 × 8?",
				choices: [
					{ id: choiceId1, text: "54", isCorrect: false },
					{ id: choiceId2, text: "56", isCorrect: true },
				],
			}),
		});
		expect(JSON.parse(update?.[1]?.body as string)).not.toHaveProperty("userId");
		expect(push).toHaveBeenCalledWith(`/mcq?userId=${userId}`);
	});

	it("shows Question not found on a 404", async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: false,
			status: 404,
			json: async () => ({ error: "Question not found." }),
		} as Response);

		render(<QuestionForm userId={userId} questionId={questionId} />);

		expect(await screen.findByText("Question not found.")).toBeTruthy();
		expect(screen.getByRole("link", { name: /back to questions/i }).getAttribute("href")).toBe(
			`/mcq?userId=${userId}`,
		);
	});
});
