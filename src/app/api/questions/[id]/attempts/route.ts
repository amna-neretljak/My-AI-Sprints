import { NextResponse } from "next/server";
import { recordAttempt } from "@/lib/services/attempt-service";
import {
	InvalidChoiceError,
	QuestionNotFoundError,
	UserNotFoundError,
} from "@/lib/services/question-service";
import { attemptSchema } from "@/lib/validation/question";

type AttemptRouteContext = {
	params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: AttemptRouteContext) {
	const { id } = await context.params;
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
	}

	const parsed = attemptSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
	}

	try {
		const attempt = await recordAttempt(parsed.data.userId, id, parsed.data.choiceId);
		return NextResponse.json({ attempt }, { status: 201 });
	} catch (error) {
		if (error instanceof InvalidChoiceError) {
			return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
		}
		if (error instanceof QuestionNotFoundError) {
			return NextResponse.json({ error: "Question not found." }, { status: 404 });
		}
		if (error instanceof UserNotFoundError) {
			return NextResponse.json({ error: "User not found." }, { status: 404 });
		}
		return NextResponse.json({ error: "Unable to record answer." }, { status: 500 });
	}
}
