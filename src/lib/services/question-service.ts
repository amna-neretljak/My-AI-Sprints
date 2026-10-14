import { getDb } from "@/lib/db";

export type QuestionSummary = {
	id: string;
	name: string;
	question: string;
	createdAt: string;
	updatedAt: string;
};

export type Choice = {
	id: string;
	text: string;
	position: number;
	isCorrect?: boolean;
};

export type Question = QuestionSummary & {
	choices: Choice[];
};

export type ChoiceInput = {
	id?: string;
	text: string;
	isCorrect: boolean;
};

export type QuestionInput = {
	name: string;
	question: string;
	choices: ChoiceInput[];
};

type QuestionRow = {
	id: string;
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

export class QuestionNotFoundError extends Error {
	constructor() {
		super("Question not found.");
		this.name = "QuestionNotFoundError";
	}
}

export class InvalidChoiceError extends Error {
	constructor() {
		super("Choice does not belong to this question.");
		this.name = "InvalidChoiceError";
	}
}

export class UserNotFoundError extends Error {
	constructor() {
		super("User not found.");
		this.name = "UserNotFoundError";
	}
}

function isForeignKeyError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("FOREIGN KEY constraint failed");
}

function assertQuestionInput(input: QuestionInput) {
	const name = input.name.trim();
	const question = input.question.trim();
	const correctCount = input.choices.filter((choice) => choice.isCorrect).length;
	const choiceTextInvalid = input.choices.some((choice) => {
		const text = choice.text.trim();
		return text.length < 1 || text.length > 500;
	});

	if (
		name.length < 1 ||
		name.length > 200 ||
		question.length < 1 ||
		question.length > 1000 ||
		input.choices.length < 2 ||
		input.choices.length > 6 ||
		correctCount !== 1 ||
		choiceTextInvalid
	) {
		throw new Error("Invalid question.");
	}
}

function toSummary(row: QuestionRow): QuestionSummary {
	return {
		id: row.id,
		name: row.name,
		question: row.question,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toChoice(row: ChoiceRow, includeAnswers: boolean): Choice {
	const choice: Choice = {
		id: row.id,
		text: row.text,
		position: row.position,
	};
	if (includeAnswers) {
		choice.isCorrect = row.is_correct === 1;
	}
	return choice;
}

export async function listQuestions(): Promise<QuestionSummary[]> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, name, question, created_at, updated_at
       FROM questions
       ORDER BY created_at DESC`,
		)
		.all<QuestionRow>();
	return results.map(toSummary);
}

export async function getQuestion(
	id: string,
	options: { includeAnswers: boolean },
): Promise<Question | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, name, question, created_at, updated_at
       FROM questions
       WHERE id = ?1`,
		)
		.bind(id)
		.all<QuestionRow>();
	const row = results[0];
	if (!row) {
		return null;
	}

	const choices = await db
		.prepare(
			`SELECT id, text, is_correct, position
       FROM choices
       WHERE question_id = ?1
       ORDER BY position`,
		)
		.bind(id)
		.all<ChoiceRow>();

	return {
		...toSummary(row),
		choices: choices.results.map((choice) => toChoice(choice, options.includeAnswers)),
	};
}

export async function createQuestion(userId: string, input: QuestionInput): Promise<Question> {
	assertQuestionInput(input);
	const db = await getDb();
	const questionId = crypto.randomUUID().replaceAll("-", "");

	try {
		await db.batch([
			db
				.prepare(
					`INSERT INTO questions (id, user_id, name, question)
           VALUES (?1, ?2, ?3, ?4)`,
				)
				.bind(questionId, userId, input.name.trim(), input.question.trim()),
			...input.choices.map((choice, position) =>
				db
					.prepare(
						`INSERT INTO choices (question_id, text, is_correct, position)
             VALUES (?1, ?2, ?3, ?4)`,
					)
					.bind(questionId, choice.text.trim(), choice.isCorrect ? 1 : 0, position),
			),
		]);
	} catch (error) {
		if (isForeignKeyError(error)) {
			throw new UserNotFoundError();
		}
		throw error;
	}

	const created = await getQuestion(questionId, { includeAnswers: true });
	if (!created) {
		throw new Error("Unable to save question.");
	}
	return created;
}

export async function updateQuestion(id: string, input: QuestionInput): Promise<Question> {
	assertQuestionInput(input);
	const existing = await getQuestion(id, { includeAnswers: true });
	if (!existing) {
		throw new QuestionNotFoundError();
	}

	const existingIds = new Set(existing.choices.map((choice) => choice.id));
	if (input.choices.some((choice) => choice.id !== undefined && !existingIds.has(choice.id))) {
		throw new InvalidChoiceError();
	}

	const keptIds = new Set(
		input.choices.flatMap((choice) => (choice.id !== undefined ? [choice.id] : [])),
	);
	const removedIds = existing.choices
		.filter((choice) => !keptIds.has(choice.id))
		.map((choice) => choice.id);

	const db = await getDb();
	await db.batch([
		db
			.prepare(
				`UPDATE questions
         SET name = ?1, question = ?2, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?3`,
			)
			.bind(input.name.trim(), input.question.trim(), id),
		...input.choices.flatMap((choice, position) => {
			if (choice.id === undefined) {
				return [];
			}
			return [
				db
					.prepare(
						`UPDATE choices
             SET text = ?1, is_correct = ?2, position = ?3, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?4 AND question_id = ?5`,
					)
					.bind(choice.text.trim(), choice.isCorrect ? 1 : 0, position, choice.id, id),
			];
		}),
		...input.choices.flatMap((choice, position) => {
			if (choice.id !== undefined) {
				return [];
			}
			return [
				db
					.prepare(
						`INSERT INTO choices (question_id, text, is_correct, position)
             VALUES (?1, ?2, ?3, ?4)`,
					)
					.bind(id, choice.text.trim(), choice.isCorrect ? 1 : 0, position),
			];
		}),
		...removedIds.map((choiceId) =>
			db
				.prepare(`DELETE FROM choices WHERE id = ?1 AND question_id = ?2`)
				.bind(choiceId, id),
		),
	]);

	const updated = await getQuestion(id, { includeAnswers: true });
	if (!updated) {
		throw new Error("Unable to save question.");
	}
	return updated;
}

export async function deleteQuestion(id: string): Promise<void> {
	const db = await getDb();
	const result = await db.prepare(`DELETE FROM questions WHERE id = ?1`).bind(id).run();
	if (result.meta.changes === 0) {
		throw new QuestionNotFoundError();
	}
}
