import { QuestionForm } from "@/components/mcq/question-form";

export default async function NewQuestionPage({
	searchParams,
}: {
	searchParams: Promise<{ userId?: string }>;
}) {
	const { userId } = await searchParams;
	return <QuestionForm userId={userId ?? null} />;
}
