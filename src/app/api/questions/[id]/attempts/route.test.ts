import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/questions/[id]/attempts/route";
import { recordAttempt } from "@/lib/services/attempt-service";
import {
	InvalidChoiceError,
	QuestionNotFoundError,
	UserNotFoundError,
} from "@/lib/services/question-service";

vi.mock("@/lib/services/attempt-service", () => ({
	recordAttempt: vi.fn(),
}));

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

	class UserNotFoundError extends Error {
		constructor() {
			super("User not found.");
			this.name = "UserNotFoundError";
		}
	}

	return {
		QuestionNotFoundError,
		InvalidChoiceError,
		UserNotFoundError,
	};
});

const userId = "a".repeat(32);
const choiceId = "c".repeat(32);
const questionId = "q1";

const attempt = {
	id: "attempt-1",
	questionId,
	choiceId,
	isCorrect: true,
	createdAt: "2026-10-14 10:05:00",
};

function context() {
	return { params: Promise.resolve({ id: questionId }) };
}

function attemptRequest(body: unknown) {
	return POST(
		new Request(`http://localhost/api/questions/${questionId}/attempts`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
		context(),
	);
}

describe("POST /api/questions/[id]/attempts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the attempt using the service's isCorrect", async () => {
		vi.mocked(recordAttempt).mockResolvedValue(attempt);

		const response = await attemptRequest({ userId, choiceId });
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body).toEqual({ attempt });
		expect(body.attempt.isCorrect).toBe(true);
		expect(recordAttempt).toHaveBeenCalledWith(userId, questionId, choiceId);
	});

	it("ignores isCorrect sent by the client", async () => {
		vi.mocked(recordAttempt).mockResolvedValue(attempt);

		const response = await attemptRequest({ userId, choiceId, isCorrect: false });
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body.attempt.isCorrect).toBe(true);
		expect(recordAttempt).toHaveBeenCalledTimes(1);
		expect(recordAttempt).toHaveBeenCalledWith(userId, questionId, choiceId);
		expect(vi.mocked(recordAttempt).mock.calls[0]).toHaveLength(3);
	});

	it("returns 400 for a bad answer and 404 for a missing question", async () => {
		const malformed = [
			{ userId: "nope", choiceId },
			{ userId, choiceId: "nope" },
			{ userId: "A".repeat(32), choiceId },
		];

		for (const invalid of malformed) {
			const response = await attemptRequest(invalid);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "Invalid answer." });
		}
		expect(recordAttempt).not.toHaveBeenCalled();

		vi.mocked(recordAttempt).mockRejectedValue(new InvalidChoiceError());
		const foreignChoice = await attemptRequest({ userId, choiceId });
		expect(foreignChoice.status).toBe(400);
		expect(await foreignChoice.json()).toEqual({ error: "Invalid answer." });

		vi.mocked(recordAttempt).mockRejectedValue(new QuestionNotFoundError());
		const missing = await attemptRequest({ userId, choiceId });
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({ error: "Question not found." });

		vi.mocked(recordAttempt).mockRejectedValue(new UserNotFoundError());
		const missingUser = await attemptRequest({ userId, choiceId });
		expect(missingUser.status).toBe(404);
		expect(await missingUser.json()).toEqual({ error: "User not found." });
	});
});
