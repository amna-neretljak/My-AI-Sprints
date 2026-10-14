import { QuestionList } from "@/components/mcq/question-list";

export default async function McqPage({
	searchParams,
}: {
	searchParams: Promise<{ userId?: string }>;
}) {
	const { userId } = await searchParams;
	return <QuestionList userId={userId ?? null} />;
}
