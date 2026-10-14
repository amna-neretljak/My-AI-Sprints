import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { recordAttempt } from "@/lib/services/attempt-service";
import { InvalidChoiceError, QuestionNotFoundError } from "@/lib/services/question-service";

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(),
}));

type StatementCall = {
	sql: string;
	args: unknown[];
};

const answererId = "a".repeat(32);
const creatorId = "b".repeat(32);

function mockDb(options?: {
	question?: { id: string; user_id: string } | null;
	choice?: { is_correct: number } | null;
	attempt?: {
		id: string;
		question_id: string;
		choice_id: string;
		is_correct: number;
		created_at: string;
	} | null;
}) {
	const calls: StatementCall[] = [];
	const db = {
		prepare(sql: string) {
			return {
				bind(...args: unknown[]) {
					calls.push({ sql, args });
					return {
						async run() {
							return { success: true, meta: { changes: 1 } };
						},
						async all() {
							if (/FROM questions/i.test(sql)) {
								return { results: options?.question ? [options.question] : [] };
							}
							if (/FROM choices/i.test(sql)) {
								return { results: options?.choice ? [options.choice] : [] };
							}
							if (/FROM attempts/i.test(sql)) {
								return { results: options?.attempt ? [options.attempt] : [] };
							}
							return { results: [] };
						},
					};
				},
			};
		},
	};

	vi.mocked(getDb).mockResolvedValue(db as Awaited<ReturnType<typeof getDb>>);
	return calls;
}

const storedAttempt = {
	id: "attempt-1",
	question_id: "q1",
	choice_id: "c2",
	is_correct: 1,
	created_at: "2026-10-14 10:05:00",
};

describe("attempt service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("records a correct choice as is_correct 1", async () => {
		const calls = mockDb({
			question: { id: "q1", user_id: creatorId },
			choice: { is_correct: 1 },
			attempt: storedAttempt,
		});

		const attempt = await recordAttempt(answererId, "q1", "c2");

		expect(attempt).toEqual({
			id: "attempt-1",
			questionId: "q1",
			choiceId: "c2",
			isCorrect: true,
			createdAt: "2026-10-14 10:05:00",
		});
		const insert = calls.find((call) => /\bINSERT\b/i.test(call.sql));
		expect(insert?.args[4]).toBe(1);
	});

	it("records a wrong choice as is_correct 0", async () => {
		const calls = mockDb({
			question: { id: "q1", user_id: creatorId },
			choice: { is_correct: 0 },
			attempt: { ...storedAttempt, choice_id: "c1", is_correct: 0 },
		});

		const attempt = await recordAttempt(answererId, "q1", "c1");

		expect(attempt.isCorrect).toBe(false);
		const insert = calls.find((call) => /\bINSERT\b/i.test(call.sql));
		expect(insert?.args[4]).toBe(0);
	});

	it("binds the answering teacher rather than the question creator", async () => {
		const calls = mockDb({
			question: { id: "q1", user_id: creatorId },
			choice: { is_correct: 1 },
			attempt: storedAttempt,
		});

		await recordAttempt(answererId, "q1", "c2");

		const insert = calls.find((call) => /\bINSERT\b/i.test(call.sql));
		expect(insert?.sql).toMatch(/INSERT INTO attempts/i);
		expect(insert?.args[1]).toBe(answererId);
		expect(insert?.args).not.toContain(creatorId);
	});

	it("rejects a choice from another question and inserts nothing", async () => {
		const calls = mockDb({
			question: { id: "q1", user_id: creatorId },
			choice: null,
		});

		await expect(recordAttempt(answererId, "q1", "c-other")).rejects.toBeInstanceOf(InvalidChoiceError);

		const choiceSelect = calls.find((call) => /FROM choices/i.test(call.sql));
		expect(choiceSelect?.sql).toMatch(/id = \?1 AND question_id = \?2/i);
		expect(choiceSelect?.args).toEqual(["c-other", "q1"]);
		expect(calls.some((call) => /\bINSERT\b/i.test(call.sql))).toBe(false);
	});

	it("rejects a missing question and inserts nothing", async () => {
		const calls = mockDb({ question: null, choice: { is_correct: 1 } });

		await expect(recordAttempt(answererId, "missing", "c2")).rejects.toBeInstanceOf(
			QuestionNotFoundError,
		);
		expect(calls.some((call) => /FROM choices/i.test(call.sql))).toBe(false);
		expect(calls.some((call) => /\bINSERT\b/i.test(call.sql))).toBe(false);
	});
});
