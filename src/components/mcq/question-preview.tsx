"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type PreviewChoice = {
	id: string;
	text: string;
	position: number;
};

type PreviewQuestion = {
	name: string;
	question: string;
	choices: PreviewChoice[];
};

export function QuestionPreview({
	userId,
	questionId,
}: {
	userId: string | null;
	questionId: string;
}) {
	const listHref = `/mcq?userId=${userId ?? ""}`;
	const [question, setQuestion] = useState<PreviewQuestion | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [loadState, setLoadState] = useState<"loading" | "missing" | "ready">("loading");

	useEffect(() => {
		if (!userId) {
			return;
		}

		let cancelled = false;
		async function load() {
			try {
				const response = await fetch(`/api/questions/${questionId}`);
				const body = (await response.json()) as { question?: PreviewQuestion; error?: string };
				if (response.status === 404) {
					if (!cancelled) {
						setLoadState("missing");
					}
					return;
				}
				if (!response.ok || !body.question) {
					if (!cancelled) {
						setError(body.error ?? "Unable to load question.");
						setLoadState("ready");
					}
					return;
				}
				if (!cancelled) {
					setQuestion({
						...body.question,
						choices: [...body.question.choices].sort((left, right) => left.position - right.position),
					});
					setLoadState("ready");
				}
			} catch {
				if (!cancelled) {
					setError("Unable to load question.");
					setLoadState("ready");
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [questionId, userId]);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedId || !userId) {
			return;
		}

		setPending(true);
		setStatus(null);
		setError(null);
		try {
			const response = await fetch(`/api/questions/${questionId}/attempts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId, choiceId: selectedId }),
			});
			const body = (await response.json()) as { attempt?: { isCorrect?: boolean }; error?: string };
			if (!response.ok || !body.attempt) {
				setError(body.error ?? "Unable to record answer.");
				return;
			}
			setStatus(body.attempt.isCorrect ? "Correct answer!" : "Incorrect answer. Try again.");
		} catch {
			setError("Unable to record answer.");
		} finally {
			setPending(false);
		}
	}

	if (!userId) {
		return (
			<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col justify-center gap-4 p-6 md:p-10">
				<p>Log in to see the questions.</p>
				<Link href="/login" className="text-primary underline underline-offset-4">
					Log in
				</Link>
			</div>
		);
	}

	if (loadState === "missing") {
		return (
			<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col justify-center gap-4 p-6 md:p-10">
				<p>Question not found.</p>
				<Link href={listHref} className="text-primary underline underline-offset-4">
					Back to questions
				</Link>
			</div>
		);
	}

	if (loadState === "loading") {
		return (
			<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col justify-center p-6 md:p-10">
				<p>Loading question…</p>
			</div>
		);
	}

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-6 p-6 md:p-10">
			<div className="flex flex-col gap-2">
				<h1 className="font-heading text-2xl font-medium">{question?.name}</h1>
				<p>{question?.question}</p>
			</div>
			<form noValidate onSubmit={onSubmit}>
				<FieldSet>
					<RadioGroup value={selectedId ?? ""} onValueChange={setSelectedId}>
						{question?.choices.map((choice) => (
							<Field key={choice.id} orientation="horizontal" className="items-center">
								<RadioGroupItem
									value={choice.id}
									id={`choice-${choice.id}`}
									aria-label={choice.text}
								/>
								<FieldLabel htmlFor={`choice-${choice.id}`}>{choice.text}</FieldLabel>
							</Field>
						))}
					</RadioGroup>
					{status ? <p role="status">{status}</p> : null}
					{error ? <p role="alert">{error}</p> : null}
					<div className="flex gap-2">
						<Button type="submit" disabled={pending || selectedId === null}>
							Submit
						</Button>
						<Link href={listHref} className="text-primary underline underline-offset-4">
							Back to questions
						</Link>
					</div>
				</FieldSet>
			</form>
		</div>
	);
}
