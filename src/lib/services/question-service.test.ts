import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import {
	createQuestion,
	deleteQuestion,
	getQuestion,
	InvalidChoiceError,
	listQuestions,
	QuestionNotFoundError,
	updateQuestion,
	UserNotFoundError,
} from "@/lib/services/question-service";

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(),
}));

type StatementCall = {
	sql: string;
	args: unknown[];
};

type QuestionRow = {
	id: string;
	user_id?: string;
	name: string;
	question: string;
	created_at: string;
	updated_at: string;
};

type ChoiceRow = {
	id: string;
	text: string;
	is_correct: number;
	position: number;
};

const userId = "a".repeat(32);
const creatorId = "b".repeat(32);

const questionRow: QuestionRow = {
	id: "q1",
	user_id: creatorId,
	name: "Times tables 7",
	question: "What is 7 × 8?",
	created_at: "2026-10-14 10:00:00",
	updated_at: "2026-10-14 10:00:00",
};

const choiceRows: ChoiceRow[] = [
	{ id: "c1", text: "54", is_correct: 0, position: 0 },
	{ id: "c2", text: "56", is_correct: 1, position: 1 },
];

const validInput = {
	name: "Times tables 7",
	question: "What is 7 × 8?",
	choices: [
		{ text: "54", isCorrect: false },
		{ text: "56", isCorrect: true },
	],
};

function mockDb(options?: {
	questions?: QuestionRow[];
	choices?: ChoiceRow[];
	changes?: number;
	foreignKey?: boolean;
}) {
	const calls: StatementCall[] = [];
	const batches: number[] = [];
	const db = {
		prepare(sql: string) {
			const call: StatementCall = { sql, args: [] };
			calls.push(call);
			const statement = {
				bind(...args: unknown[]) {
					call.args = args;
					return statement;
				},
				async run() {
					if (options?.foreignKey && /\bINSERT\b/i.test(sql)) {
						throw new Error("FOREIGN KEY constraint failed");
					}
					return { success: true, meta: { changes: options?.changes ?? 1 } };
				},
				async all() {
					if (/FROM questions/i.test(sql)) {
						return { results: options?.questions ?? [] };
					}
					if (/FROM choices/i.test(sql)) {
						return { results: options?.choices ?? [] };
					}
					return { results: [] };
				},
			};
			return statement;
		},
		async batch(statements: Array<{ run: () => Promise<unknown> }>) {
			batches.push(statements.length);
			for (const statement of statements) {
				await statement.run();
			}
		},
	};

	vi.mocked(getDb).mockResolvedValue(db as Awaited<ReturnType<typeof getDb>>);
	return { calls, batches };
}

describe("question service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("lists every question newest first and omits user_id", async () => {
		const { calls } = mockDb({
			questions: [
				questionRow,
				{
					...questionRow,
					id: "q2",
					user_id: userId,
					name: "Capitals",
					question: "What is the capital of France?",
				},
			],
		});

		const questions = await listQuestions();

		expect(questions).toEqual([
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
				createdAt: "2026-10-14 10:00:00",
				updatedAt: "2026-10-14 10:00:00",
			},
		]);
		expect(questions[0]).not.toHaveProperty("userId");
		expect(questions[0]).not.toHaveProperty("user_id");

		const select = calls.find((call) => /\bSELECT\b/i.test(call.sql));
		expect(select?.sql).not.toMatch(/\bWHERE\b/i);
		expect(select?.sql).not.toMatch(/user_id/);
		expect(select?.sql).toMatch(/ORDER BY created_at DESC/i);
	});

	it("creates a question and its choices in one batch with one correct answer", async () => {
		const { calls, batches } = mockDb({ questions: [questionRow], choices: choiceRows });

		const created = await createQuestion(userId, validInput);

		expect(created.choices.map((choice) => choice.isCorrect)).toEqual([false, true]);
		expect(batches).toEqual([3]);

		const inserts = calls.filter((call) => /\bINSERT\b/i.test(call.sql));
		expect(inserts).toHaveLength(3);
		expect(inserts[0]?.sql).toMatch(/INSERT INTO questions/i);
		expect(inserts[0]?.args[0]).toMatch(/^[0-9a-f]{32}$/);
		expect(inserts[0]?.args.slice(1)).toEqual([userId, "Times tables 7", "What is 7 × 8?"]);
		expect(inserts.slice(1).map((call) => call.args)).toEqual([
			[inserts[0]?.args[0], "54", 0, 0],
			[inserts[0]?.args[0], "56", 1, 1],
		]);
	});

	it("rejects an invalid question without querying the database", async () => {
		const cases = [
			{ ...validInput, question: "" },
			{
				...validInput,
				choices: [
					{ text: "54", isCorrect: false },
					{ text: "56", isCorrect: false },
				],
			},
			{
				...validInput,
				choices: [
					{ text: "54", isCorrect: true },
					{ text: "56", isCorrect: true },
				],
			},
			{ ...validInput, choices: [{ text: "56", isCorrect: true }] },
			{
				...validInput,
				choices: Array.from({ length: 7 }, (_, index) => ({
					text: `Choice ${index}`,
					isCorrect: index === 0,
				})),
			},
		];

		for (const input of cases) {
			vi.clearAllMocks();
			await expect(createQuestion(userId, input)).rejects.toThrow("Invalid question.");
			expect(getDb).not.toHaveBeenCalled();
		}
	});

	it("turns a foreign-key failure on create into UserNotFoundError", async () => {
		mockDb({ foreignKey: true });

		await expect(createQuestion(userId, validInput)).rejects.toBeInstanceOf(UserNotFoundError);
	});

	it("returns choices in position order and hides the correct answer unless asked", async () => {
		const { calls } = mockDb({ questions: [questionRow], choices: choiceRows });

		const hidden = await getQuestion("q1", { includeAnswers: false });

		expect(hidden).toEqual({
			id: "q1",
			name: "Times tables 7",
			question: "What is 7 × 8?",
			createdAt: "2026-10-14 10:00:00",
			updatedAt: "2026-10-14 10:00:00",
			choices: [
				{ id: "c1", text: "54", position: 0 },
				{ id: "c2", text: "56", position: 1 },
			],
		});
		expect(hidden?.choices[0]).not.toHaveProperty("isCorrect");

		const choiceSelect = calls.find((call) => /FROM choices/i.test(call.sql));
		expect(choiceSelect?.sql).toMatch(/ORDER BY position/i);

		const revealed = await getQuestion("q1", { includeAnswers: true });
		expect(revealed?.choices.map((choice) => choice.isCorrect)).toEqual([false, true]);

		mockDb({ questions: [] });
		expect(await getQuestion("missing", { includeAnswers: false })).toBeNull();
	});

	it("updates kept choices, inserts new ones, deletes missing ones, and leaves user_id unchanged", async () => {
		const { calls, batches } = mockDb({ questions: [questionRow], choices: choiceRows });

		await updateQuestion("q1", {
			name: "Times tables 7 revised",
			question: "What is 7 × 8?",
			choices: [
				{ id: "c1", text: "54", isCorrect: false },
				{ text: "64", isCorrect: true },
			],
		});

		const questionUpdate = calls.find((call) => /UPDATE questions/i.test(call.sql));
		expect(questionUpdate?.sql).toMatch(/updated_at/i);
		expect(questionUpdate?.sql).not.toMatch(/user_id/);
		expect(questionUpdate?.args).toEqual(["Times tables 7 revised", "What is 7 × 8?", "q1"]);
		expect(questionUpdate?.args).not.toContain(creatorId);

		const choiceUpdate = calls.find((call) => /UPDATE choices/i.test(call.sql));
		expect(choiceUpdate?.sql).toMatch(/updated_at/i);
		expect(choiceUpdate?.args).toEqual(["54", 0, 0, "c1", "q1"]);

		const choiceInsert = calls.find((call) => /INSERT INTO choices/i.test(call.sql));
		expect(choiceInsert?.args).toEqual(["q1", "64", 1, 1]);

		const choiceDelete = calls.find((call) => /\bDELETE\b/i.test(call.sql));
		expect(choiceDelete?.args).toEqual(["c2", "q1"]);
		expect(batches).toEqual([4]);
	});

	it("throws when the question is missing or a choice belongs to another question", async () => {
		mockDb({ questions: [] });
		await expect(updateQuestion("missing", validInput)).rejects.toBeInstanceOf(QuestionNotFoundError);

		const { calls } = mockDb({ questions: [questionRow], choices: choiceRows });
		await expect(
			updateQuestion("q1", {
				...validInput,
				choices: [
					{ id: "c-other", text: "54", isCorrect: false },
					{ id: "c2", text: "56", isCorrect: true },
				],
			}),
		).rejects.toBeInstanceOf(InvalidChoiceError);
		expect(calls.some((call) => /\b(INSERT|UPDATE|DELETE)\b/i.test(call.sql))).toBe(false);
	});

	it("deletes a question by id and reports a missing row", async () => {
		const { calls } = mockDb({ changes: 1 });

		await deleteQuestion("q1");

		expect(calls[0]?.sql).toMatch(/DELETE FROM questions WHERE id = \?1/i);
		expect(calls[0]?.args).toEqual(["q1"]);

		mockDb({ changes: 0 });
		await expect(deleteQuestion("missing")).rejects.toBeInstanceOf(QuestionNotFoundError);
	});
});
