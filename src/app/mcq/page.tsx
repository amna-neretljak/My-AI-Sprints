import { LogoutButton } from "@/components/logout-button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function McqPage() {
	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<div className="w-full max-w-sm">
				<Card>
					<CardHeader>
						<CardTitle>Multiple-choice questions</CardTitle>
						<CardDescription>
							The question bank will be built later. This page is a placeholder for teachers who
							have registered or logged in.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<LogoutButton />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
