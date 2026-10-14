import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/questions/route";
import { createQuestion, listQuestions, UserNotFoundError } from "@/lib/services/question-service";

vi.mock("@/lib/services/question-service", () => {
	class UserNotFoundError extends Error {
		constructor() {
			super("User not found.");
			this.name = "UserNotFoundError";
		}
	}

	return {
		listQuestions: vi.fn(),
		createQuestion: vi.fn(),
		getQuestion: vi.fn(),
		updateQuestion: vi.fn(),
		deleteQuestion: vi.fn(),
		UserNotFoundError,
	};
});

const userId = "a".repeat(32);

const summary = {
	id: "q1",
	name: "Times tables 7",
	question: "What is 7 × 8?",
	createdAt: "2026-10-14 10:00:00",
	updatedAt: "2026-10-14 10:00:00",
};

const createdQuestion = {
	...summary,
	choices: [
		{ id: "c1", text: "54", position: 0, isCorrect: false },
		{ id: "c2", text: "56", position: 1, isCorrect: true },
	],
};

const validBody = {
	userId,
	name: "Times tables 7",
	question: "What is 7 × 8?",
	choices: [
		{ text: "54", isCorrect: false },
		{ text: "56", isCorrect: true },
	],
};

function postQuestion(body: unknown) {
	return POST(
		new Request("http://localhost/api/questions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("/api/questions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns every question and leaves user_id out of the response", async () => {
		vi.mocked(listQuestions).mockResolvedValue([{ ...summary, user_id: "secret" } as never]);

		const response = await GET(new Request("http://localhost/api/questions"));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ questions: [summary] });
		expect(JSON.stringify(body)).not.toContain("user_id");
		expect(JSON.stringify(body)).not.toContain("secret");
	});

	it("creates a question and passes userId to the service", async () => {
		vi.mocked(createQuestion).mockResolvedValue(createdQuestion);

		const response = await postQuestion({
			...validBody,
			name: "  Times tables 7  ",
			question: "  What is 7 × 8?  ",
		});
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body).toEqual({ question: createdQuestion });
		expect(createQuestion).toHaveBeenCalledWith(userId, {
			name: "Times tables 7",
			question: "What is 7 × 8?",
			choices: validBody.choices,
		});
	});

	it("returns 400 for an invalid question", async () => {
		const sevenChoices = Array.from({ length: 7 }, (_, index) => ({
			text: `Choice ${index}`,
			isCorrect: index === 0,
		}));
		const invalidBodies = [
			{ ...validBody, userId: undefined },
			{ ...validBody, userId: "not-a-user" },
			{ ...validBody, userId: "A".repeat(32) },
			{ ...validBody, name: "" },
			{ ...validBody, question: "" },
			{ userId, name: "Times tables 7", choices: validBody.choices },
			{ ...validBody, choices: [{ text: "56", isCorrect: true }] },
			{ ...validBody, choices: sevenChoices },
			{
				...validBody,
				choices: [
					{ text: "54", isCorrect: false },
					{ text: "56", isCorrect: false },
				],
			},
			{
				...validBody,
				choices: [
					{ text: "54", isCorrect: true },
					{ text: "56", isCorrect: true },
				],
			},
			{
				...validBody,
				choices: [
					{ text: "", isCorrect: false },
					{ text: "56", isCorrect: true },
				],
			},
		];

		for (const invalid of invalidBodies) {
			const response = await postQuestion(invalid);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "Invalid question." });
		}

		expect(createQuestion).not.toHaveBeenCalled();
	});

	it("returns 404 when the user does not exist", async () => {
		vi.mocked(createQuestion).mockRejectedValue(new UserNotFoundError());

		const response = await postQuestion(validBody);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "User not found." });
	});
});
