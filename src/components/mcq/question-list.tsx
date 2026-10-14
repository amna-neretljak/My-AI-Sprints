"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EllipsisVertical } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type QuestionSummary = {
	id: string;
	name: string;
	question: string;
};

export function QuestionList({ userId }: { userId: string | null }) {
	const [questions, setQuestions] = useState<QuestionSummary[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<QuestionSummary | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		if (!userId) {
			return;
		}

		let cancelled = false;
		async function load() {
			try {
				const response = await fetch("/api/questions");
				const body = (await response.json()) as { questions?: QuestionSummary[]; error?: string };
				if (!response.ok) {
					throw new Error(body.error ?? "Unable to load questions.");
				}
				if (!cancelled) {
					setQuestions(body.questions ?? []);
				}
			} catch {
				if (!cancelled) {
					setError("Unable to load questions.");
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [userId]);

	async function confirmDelete() {
		if (!pendingDelete) {
			return;
		}
		setDeleting(true);
		setDeleteError(null);
		try {
			const response = await fetch(`/api/questions/${pendingDelete.id}`, { method: "DELETE" });
			const body = (await response.json()) as { error?: string };
			if (!response.ok) {
				setDeleteError(body.error ?? "Unable to delete question.");
				return;
			}
			setQuestions((current) => (current ?? []).filter((question) => question.id !== pendingDelete.id));
			setPendingDelete(null);
		} catch {
			setDeleteError("Unable to delete question.");
		} finally {
			setDeleting(false);
		}
	}

	if (!userId) {
		return (
			<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col justify-center gap-4 p-6 md:p-10">
				<h1 className="font-heading text-2xl font-medium">Multiple-choice questions</h1>
				<p>Log in to see the questions.</p>
				<Link href="/login" className="text-primary underline underline-offset-4">
					Log in
				</Link>
			</div>
		);
	}

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-6 p-6 md:p-10">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="font-heading text-2xl font-medium">Multiple-choice questions</h1>
				<div className="flex items-center gap-2">
					<Link href={`/mcq/new?userId=${userId}`} className={buttonVariants()}>
						Create
					</Link>
					<LogoutButton />
				</div>
			</header>

			{error ? <p>{error}</p> : null}
			{!error && questions === null ? <p>Loading questions…</p> : null}
			{!error && questions?.length === 0 ? <p>No questions yet. Create the first question.</p> : null}

			{questions && questions.length > 0 ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Question</TableHead>
							<TableHead className="w-16">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{questions.map((question) => (
							<TableRow key={question.id}>
								<TableCell>{question.name}</TableCell>
								<TableCell className="max-w-xl truncate">{question.question}</TableCell>
								<TableCell>
									<DropdownMenu>
										<DropdownMenuTrigger
											render={<Button variant="ghost" size="icon" />}
											aria-label={`Actions for ${question.name}`}
										>
											<EllipsisVertical />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												render={<Link href={`/mcq/${question.id}/edit?userId=${userId}`} />}
											>
												Edit
											</DropdownMenuItem>
											<DropdownMenuItem
												render={<Link href={`/mcq/${question.id}/preview?userId=${userId}`} />}
											>
												Preview
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												onClick={() => {
													setDeleteError(null);
													setPendingDelete(question);
												}}
											>
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : null}

			<AlertDialog
				open={pendingDelete !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPendingDelete(null);
						setDeleteError(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this question?</AlertDialogTitle>
						<AlertDialogDescription>
							This also deletes its choices and answers.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{deleteError ? <p className="text-destructive">{deleteError}</p> : null}
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDelete} disabled={deleting}>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
