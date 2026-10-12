import { NextResponse } from "next/server";
import { z } from "zod";
import { findByUsernameOrEmail, verifyPassword } from "@/lib/services/user-service";

const loginSchema = z.object({
	identifier: z.string().trim().min(1),
	password: z.string().regex(/^[0-9a-f]{64}$/),
});

export async function POST(request: Request) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid login." }, { status: 400 });
	}

	const parsed = loginSchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid login." }, { status: 400 });
	}

	try {
		const user = await findByUsernameOrEmail(parsed.data.identifier);
		const passwordMatches = await verifyPassword(parsed.data.identifier, parsed.data.password);
		if (!user || !passwordMatches) {
			return NextResponse.json(
				{ error: "Invalid username, email, or password." },
				{ status: 401 },
			);
		}

		return NextResponse.json({
			user: {
				id: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				username: user.username,
				email: user.email,
			},
		});
	} catch {
		return NextResponse.json({ error: "Unable to log in." }, { status: 500 });
	}
}
