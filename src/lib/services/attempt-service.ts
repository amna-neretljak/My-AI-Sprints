import { getDb } from "@/lib/db";
import {
	InvalidChoiceError,
	QuestionNotFoundError,
	UserNotFoundError,
} from "@/lib/services/question-service";

export type Attempt = {
	id: string;
	questionId: string;
	choiceId: string;
	isCorrect: boolean;
	createdAt: string;
};

type AttemptRow = {
	id: string;
	question_id: string;
	choice_id: string;
	is_correct: number;
	created_at: string;
};

function isForeignKeyError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("FOREIGN KEY constraint failed");
}

export async function recordAttempt(
	userId: string,
	questionId: string,
	choiceId: string,
): Promise<Attempt> {
	const db = await getDb();
	const question = await db
		.prepare(`SELECT id FROM questions WHERE id = ?1`)
		.bind(questionId)
		.all<{ id: string }>();
	if (!question.results[0]) {
		throw new QuestionNotFoundError();
	}

	const choice = await db
		.prepare(`SELECT is_correct FROM choices WHERE id = ?1 AND question_id = ?2`)
		.bind(choiceId, questionId)
		.all<{ is_correct: number }>();
	const selected = choice.results[0];
	if (!selected) {
		throw new InvalidChoiceError();
	}

	const attemptId = crypto.randomUUID().replaceAll("-", "");
	try {
		await db
			.prepare(
				`INSERT INTO attempts (id, user_id, question_id, choice_id, is_correct)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
			)
			.bind(attemptId, userId, questionId, choiceId, selected.is_correct)
			.run();
	} catch (error) {
		if (isForeignKeyError(error)) {
			throw new UserNotFoundError();
		}
		throw error;
	}

	const stored = await db
		.prepare(
			`SELECT id, question_id, choice_id, is_correct, created_at
       FROM attempts
       WHERE id = ?1`,
		)
		.bind(attemptId)
		.all<AttemptRow>();
	const row = stored.results[0];
	if (!row) {
		throw new Error("Unable to record answer.");
	}

	return {
		id: row.id,
		questionId: row.question_id,
		choiceId: row.choice_id,
		isCorrect: row.is_correct === 1,
		createdAt: row.created_at,
	};
}
