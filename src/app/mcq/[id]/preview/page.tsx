import { QuestionPreview } from "@/components/mcq/question-preview";

export default async function PreviewQuestionPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ userId?: string }>;
}) {
	const { id } = await params;
	const { userId } = await searchParams;
	return <QuestionPreview userId={userId ?? null} questionId={id} />;
}
