import { NextResponse } from "next/server";
import { createQuestion, listQuestions, UserNotFoundError } from "@/lib/services/question-service";
import { createQuestionSchema, toPublicQuestion } from "@/lib/validation/question";

export async function GET() {
	try {
		const questions = await listQuestions();
		return NextResponse.json({ questions: questions.map(toPublicQuestion) });
	} catch {
		return NextResponse.json({ error: "Unable to load questions." }, { status: 500 });
	}
}

export async function POST(request: Request) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid question." }, { status: 400 });
	}

	const parsed = createQuestionSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid question." }, { status: 400 });
	}

	try {
		const question = await createQuestion(parsed.data.userId, {
			name: parsed.data.name,
			question: parsed.data.question,
			choices: parsed.data.choices,
		});
		return NextResponse.json({ question: toPublicQuestion(question) }, { status: 201 });
	} catch (error) {
		if (error instanceof UserNotFoundError) {
			return NextResponse.json({ error: "User not found." }, { status: 404 });
		}
		return NextResponse.json({ error: "Unable to save question." }, { status: 500 });
	}
}
