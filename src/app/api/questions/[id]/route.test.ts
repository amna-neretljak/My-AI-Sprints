import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PUT } from "@/app/api/questions/[id]/route";
import {
	deleteQuestion,
	getQuestion,
	InvalidChoiceError,
	QuestionNotFoundError,
	updateQuestion,
} from "@/lib/services/question-service";

vi.mock("@/lib/services/question-service", () => {
	class QuestionNotFoundError extends Error {
		constructor() {
			super("Question not found.");
			this.name = "QuestionNotFoundError";
		}
	}

	class InvalidChoiceError extends Error {
		constructor() {
			super("Choice does not belong to this question.");
			this.name = "InvalidChoiceError";
		}
	}

	return {
		listQuestions: vi.fn(),
		getQuestion: vi.fn(),
		createQuestion: vi.fn(),
		updateQuestion: vi.fn(),
		deleteQuestion: vi.fn(),
		QuestionNotFoundError,
		InvalidChoiceError,
	};
});

const questionId = "q1";
const choiceId = "c".repeat(32);

const question = {
	id: questionId,
	name: "Times tables 7",
	question: "What is 7 × 8?",
	createdAt: "2026-10-14 10:00:00",
	updatedAt: "2026-10-14 10:00:00",
	choices: [
		{ id: choiceId, text: "54", position: 0, isCorrect: false },
		{ id: "d".repeat(32), text: "56", position: 1, isCorrect: true },
	],
};

const validUpdate = {
	name: "Times tables 7",
	question: "What is 7 × 8?",
	choices: [
		{ id: choiceId, text: "54", isCorrect: false },
		{ text: "64", isCorrect: true },
	],
};

function context() {
	return { params: Promise.resolve({ id: questionId }) };
}

function questionRequest(search = "", init?: RequestInit) {
	return new Request(`http://localhost/api/questions/${questionId}${search}`, init);
}

describe("/api/questions/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns a question and asks for answers only when includeAnswers=true", async () => {
		vi.mocked(getQuestion).mockResolvedValue(question);

		const hidden = await GET(questionRequest(), context());
		expect(hidden.status).toBe(200);
		expect(await hidden.json()).toEqual({ question });
		expect(getQuestion).toHaveBeenLastCalledWith(questionId, { includeAnswers: false });

		await GET(questionRequest("?includeAnswers=false"), context());
		expect(getQuestion).toHaveBeenLastCalledWith(questionId, { includeAnswers: false });

		const revealed = await GET(questionRequest("?includeAnswers=true"), context());
		expect(revealed.status).toBe(200);
		expect(getQuestion).toHaveBeenLastCalledWith(questionId, { includeAnswers: true });
	});

	it("returns 404 when the question does not exist", async () => {
		vi.mocked(getQuestion).mockResolvedValue(null);

		const response = await GET(questionRequest(), context());

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Question not found." });
	});

	it("updates a question", async () => {
		vi.mocked(updateQuestion).mockResolvedValue(question);

		const response = await PUT(
			questionRequest("", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...validUpdate, userId: "should-be-ignored" }),
			}),
			context(),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ question });
		expect(updateQuestion).toHaveBeenCalledWith(questionId, {
			name: "Times tables 7",
			question: "What is 7 × 8?",
			choices: [
				{ id: choiceId, text: "54", isCorrect: false },
				{ text: "64", isCorrect: true },
			],
		});
	});

	it("returns 400 when the update is invalid or a choice belongs elsewhere", async () => {
		const invalid = await PUT(
			questionRequest("", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...validUpdate, name: "" }),
			}),
			context(),
		);
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toEqual({ error: "Invalid question." });
		expect(updateQuestion).not.toHaveBeenCalled();

		vi.mocked(updateQuestion).mockRejectedValue(new InvalidChoiceError());
		const foreignChoice = await PUT(
			questionRequest("", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(validUpdate),
			}),
			context(),
		);
		expect(foreignChoice.status).toBe(400);
		expect(await foreignChoice.json()).toEqual({ error: "Invalid question." });
	});

	it("returns 404 when updating a missing question", async () => {
		vi.mocked(updateQuestion).mockRejectedValue(new QuestionNotFoundError());

		const response = await PUT(
			questionRequest("", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(validUpdate),
			}),
			context(),
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Question not found." });
	});

	it("deletes a question", async () => {
		vi.mocked(deleteQuestion).mockResolvedValue(undefined);

		const response = await DELETE(questionRequest(), context());

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(deleteQuestion).toHaveBeenCalledWith(questionId);
	});

	it("returns 404 when deleting a missing question", async () => {
		vi.mocked(deleteQuestion).mockRejectedValue(new QuestionNotFoundError());

		const response = await DELETE(questionRequest(), context());

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Question not found." });
	});
});
