import { z } from "zod";

const hexId = z.string().regex(/^[0-9a-f]{32}$/);

const choiceSchema = z.object({
	text: z.string().trim().min(1).max(500),
	isCorrect: z.boolean(),
});

function oneCorrectAnswer(choices: { isCorrect: boolean }[]) {
	return choices.filter((choice) => choice.isCorrect).length === 1;
}

export const createQuestionSchema = z.object({
	userId: hexId,
	name: z.string().trim().min(1).max(200),
	question: z.string().trim().min(1).max(1000),
	choices: z.array(choiceSchema).min(2).max(6).refine(oneCorrectAnswer),
});

export const updateQuestionSchema = z.object({
	name: z.string().trim().min(1).max(200),
	question: z.string().trim().min(1).max(1000),
	choices: z
		.array(
			choiceSchema.extend({
				id: hexId.optional(),
			}),
		)
		.min(2)
		.max(6)
		.refine(oneCorrectAnswer),
});

export const attemptSchema = z.object({
	userId: hexId,
	choiceId: hexId,
});

type PublicChoice = {
	id: string;
	text: string;
	position: number;
	isCorrect?: boolean;
};

type PublicQuestion = {
	id: string;
	name: string;
	question: string;
	createdAt: string;
	updatedAt: string;
	choices?: PublicChoice[];
};

export function toPublicQuestion(question: PublicQuestion): PublicQuestion {
	const publicQuestion: PublicQuestion = {
		id: question.id,
		name: question.name,
		question: question.question,
		createdAt: question.createdAt,
		updatedAt: question.updatedAt,
	};
	if (question.choices) {
		publicQuestion.choices = question.choices.map((choice) => {
			const publicChoice: PublicChoice = {
				id: choice.id,
				text: choice.text,
				position: choice.position,
			};
			if (choice.isCorrect !== undefined) {
				publicChoice.isCorrect = choice.isCorrect;
			}
			return publicChoice;
		});
	}
	return publicQuestion;
}
