import { QuestionForm } from "@/components/mcq/question-form";

export default async function EditQuestionPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ userId?: string }>;
}) {
	const { id } = await params;
	const { userId } = await searchParams;
	return <QuestionForm userId={userId ?? null} questionId={id} />;
}
