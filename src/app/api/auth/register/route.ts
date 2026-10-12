import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, UserAlreadyRegisteredError } from "@/lib/services/user-service";

const registerSchema = z.object({
	firstName: z.string().trim().min(1).max(100),
	lastName: z.string().trim().min(1).max(100),
	username: z.string().trim().min(3).max(64),
	email: z.email(),
	password: z.string().regex(/^[0-9a-f]{64}$/),
});

export async function POST(request: Request) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid registration." }, { status: 400 });
	}

	const parsed = registerSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid registration." }, { status: 400 });
	}

	try {
		const user = await createUser(parsed.data);
		return NextResponse.json({ user }, { status: 201 });
	} catch (error) {
		if (error instanceof UserAlreadyRegisteredError) {
			return NextResponse.json(
				{ error: "Username or email is already registered." },
				{ status: 409 },
			);
		}
		return NextResponse.json({ error: "Unable to register." }, { status: 500 });
	}
}
