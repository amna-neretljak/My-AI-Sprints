import { NextResponse } from "next/server";
import {
	deleteQuestion,
	getQuestion,
	InvalidChoiceError,
	QuestionNotFoundError,
	updateQuestion,
} from "@/lib/services/question-service";
import { toPublicQuestion, updateQuestionSchema } from "@/lib/validation/question";

type QuestionRouteContext = {
	params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: QuestionRouteContext) {
	const { id } = await context.params;
	const includeAnswers = new URL(request.url).searchParams.get("includeAnswers") === "true";

	try {
		const question = await getQuestion(id, { includeAnswers });
		if (!question) {
			return NextResponse.json({ error: "Question not found." }, { status: 404 });
		}
		return NextResponse.json({ question: toPublicQuestion(question) });
	} catch {
		return NextResponse.json({ error: "Unable to load question." }, { status: 500 });
	}
}

export async function PUT(request: Request, context: QuestionRouteContext) {
	const { id } = await context.params;
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid question." }, { status: 400 });
	}

	const parsed = updateQuestionSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid question." }, { status: 400 });
	}

	try {
		const question = await updateQuestion(id, {
			name: parsed.data.name,
			question: parsed.data.question,
			choices: parsed.data.choices.map((choice) =>
				choice.id === undefined
					? { text: choice.text, isCorrect: choice.isCorrect }
					: { id: choice.id, text: choice.text, isCorrect: choice.isCorrect },
			),
		});
		return NextResponse.json({ question: toPublicQuestion(question) });
	} catch (error) {
		if (error instanceof InvalidChoiceError) {
			return NextResponse.json({ error: "Invalid question." }, { status: 400 });
		}
		if (error instanceof QuestionNotFoundError) {
			return NextResponse.json({ error: "Question not found." }, { status: 404 });
		}
		return NextResponse.json({ error: "Unable to save question." }, { status: 500 });
	}
}

export async function DELETE(_request: Request, context: QuestionRouteContext) {
	const { id } = await context.params;

	try {
		await deleteQuestion(id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		if (error instanceof QuestionNotFoundError) {
			return NextResponse.json({ error: "Question not found." }, { status: 404 });
		}
		return NextResponse.json({ error: "Unable to delete question." }, { status: 500 });
	}
}
