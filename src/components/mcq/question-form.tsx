"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

type ChoiceRow = {
	key: string;
	id?: string;
	text: string;
};

type LoadedQuestion = {
	name: string;
	question: string;
	choices: Array<{ id: string; text: string; isCorrect?: boolean }>;
};

function emptyChoices(): ChoiceRow[] {
	return [
		{ key: "choice-1", text: "" },
		{ key: "choice-2", text: "" },
	];
}

export function QuestionForm({
	userId,
	questionId,
}: {
	userId: string | null;
	questionId?: string;
}) {
	const router = useRouter();
	const listHref = `/mcq?userId=${userId ?? ""}`;
	const [name, setName] = useState("");
	const [question, setQuestion] = useState("");
	const [choices, setChoices] = useState<ChoiceRow[]>(emptyChoices);
	const [correctKey, setCorrectKey] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [loadState, setLoadState] = useState<"idle" | "loading" | "missing">(
		questionId ? "loading" : "idle",
	);

	useEffect(() => {
		if (!questionId) {
			return;
		}

		let cancelled = false;
		async function load() {
			try {
				const response = await fetch(`/api/questions/${questionId}?includeAnswers=true`);
				const body = (await response.json()) as { question?: LoadedQuestion; error?: string };
				if (response.status === 404) {
					if (!cancelled) {
						setLoadState("missing");
					}
					return;
				}
				if (!response.ok || !body.question) {
					if (!cancelled) {
						setError(body.error ?? "Unable to load question.");
						setLoadState("idle");
					}
					return;
				}

				if (!cancelled) {
					setName(body.question.name);
					setQuestion(body.question.question);
					setChoices(
						body.question.choices.map((choice, index) => ({
							key: `choice-${index + 1}`,
							id: choice.id,
							text: choice.text,
						})),
					);
					const correctIndex = body.question.choices.findIndex((choice) => choice.isCorrect);
					setCorrectKey(correctIndex >= 0 ? `choice-${correctIndex + 1}` : null);
					setLoadState("idle");
				}
			} catch {
				if (!cancelled) {
					setError("Unable to load question.");
					setLoadState("idle");
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [questionId]);

	function addChoice() {
		if (choices.length >= 6) {
			return;
		}
		setChoices((current) => [...current, { key: `choice-${current.length + 1}-${Date.now()}`, text: "" }]);
	}

	function removeChoice(key: string) {
		if (choices.length <= 2) {
			return;
		}
		setChoices((current) => current.filter((choice) => choice.key !== key));
		if (correctKey === key) {
			setCorrectKey(null);
		}
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const trimmedName = name.trim();
		const trimmedQuestion = question.trim();
		if (trimmedName.length < 1) {
			setError("Enter a name.");
			return;
		}
		if (trimmedQuestion.length < 1) {
			setError("Enter the question.");
			return;
		}
		if (choices.some((choice) => choice.text.trim().length < 1)) {
			setError("Enter text for every choice.");
			return;
		}
		if (!correctKey || !choices.some((choice) => choice.key === correctKey)) {
			setError("Mark the correct answer.");
			return;
		}

		setPending(true);
		try {
			const payloadChoices = choices.map((choice) =>
				choice.id
					? {
							id: choice.id,
							text: choice.text.trim(),
							isCorrect: choice.key === correctKey,
						}
					: {
							text: choice.text.trim(),
							isCorrect: choice.key === correctKey,
						},
			);

			const response = await fetch(questionId ? `/api/questions/${questionId}` : "/api/questions", {
				method: questionId ? "PUT" : "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					questionId
						? { name: trimmedName, question: trimmedQuestion, choices: payloadChoices }
						: { userId, name: trimmedName, question: trimmedQuestion, choices: payloadChoices },
				),
			});
			const body = (await response.json()) as { error?: string };
			if (!response.ok) {
				setError(body.error ?? "Unable to save question.");
				return;
			}
			router.push(listHref);
		} catch {
			setError("Unable to save question.");
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
			<h1 className="font-heading text-2xl font-medium">
				{questionId ? "Edit question" : "Create question"}
			</h1>
			<form noValidate onSubmit={onSubmit}>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="name">Name</FieldLabel>
						<Input
							id="name"
							name="name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							maxLength={200}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="question">Question</FieldLabel>
						<Textarea
							id="question"
							name="question"
							value={question}
							onChange={(event) => setQuestion(event.target.value)}
							maxLength={1000}
						/>
					</Field>
					<FieldSet>
						<FieldLegend>Choices</FieldLegend>
						<RadioGroup value={correctKey ?? ""} onValueChange={setCorrectKey}>
							{choices.map((choice, index) => {
								const number = index + 1;
								return (
									<Field key={choice.key} orientation="horizontal" className="items-center">
										<RadioGroupItem
											value={choice.key}
											id={`correct-${choice.key}`}
											aria-label={`Mark choice ${number} as correct`}
										/>
										<FieldLabel htmlFor={`choice-${choice.key}`} className="sr-only">
											Choice {number}
										</FieldLabel>
										<Input
											id={`choice-${choice.key}`}
											name={`choice-${number}`}
											value={choice.text}
											onChange={(event) =>
												setChoices((current) =>
													current.map((row) =>
														row.key === choice.key ? { ...row, text: event.target.value } : row,
													),
												)
											}
											aria-label={`Choice ${number}`}
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={`Remove choice ${number}`}
											disabled={choices.length <= 2}
											onClick={() => removeChoice(choice.key)}
										>
											<X />
										</Button>
									</Field>
								);
							})}
						</RadioGroup>
						<Button type="button" variant="outline" disabled={choices.length >= 6} onClick={addChoice}>
							<Plus />
							Add choice
						</Button>
					</FieldSet>
					<Field>
						{error ? <FieldError>{error}</FieldError> : null}
						<div className="flex gap-2">
							<Button type="submit" disabled={pending}>
								Save
							</Button>
							<Button type="button" variant="outline" onClick={() => router.push(listHref)}>
								Cancel
							</Button>
						</div>
					</Field>
				</FieldGroup>
			</form>
		</div>
	);
}
