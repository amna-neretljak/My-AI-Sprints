import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createUser,
	deleteUser,
	updateUser,
	UserAlreadyRegisteredError,
} from "@/lib/services/user-service";
import { POST } from "@/app/api/auth/register/route";

vi.mock("@/lib/services/user-service", () => {
	class UserAlreadyRegisteredError extends Error {
		constructor() {
			super("Username or email is already registered.");
			this.name = "UserAlreadyRegisteredError";
		}
	}

	return {
		createUser: vi.fn(),
		findByUsernameOrEmail: vi.fn(),
		verifyPassword: vi.fn(),
		updateUser: vi.fn(),
		deleteUser: vi.fn(),
		UserAlreadyRegisteredError,
	};
});

const clientHash = "a".repeat(64);
const publicUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
};

function registerRequest(body: unknown) {
	return POST(
		new Request("http://localhost/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/auth/register", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 and a public user without password_hash", async () => {
		vi.mocked(createUser).mockResolvedValue(publicUser);

		const response = await registerRequest({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
			password: clientHash,
		});
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body).toEqual({ user: publicUser });
		expect(JSON.stringify(body)).not.toContain("password_hash");
		expect(JSON.stringify(body)).not.toContain("passwordHash");
		expect(createUser).toHaveBeenCalledWith({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
			password: clientHash,
		});
		expect(updateUser).not.toHaveBeenCalled();
		expect(deleteUser).not.toHaveBeenCalled();
	});

	it("returns 400 when a field is missing, the email is malformed, or the password is not a SHA-256 digest", async () => {
		const invalidBodies = [
			{
				lastName: "Lovelace",
				username: "ada",
				email: "ada@school.edu",
				password: clientHash,
			},
			{
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "not-an-email",
				password: clientHash,
			},
			{
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "ada@school.edu",
				password: "password",
			},
		];

		for (const invalid of invalidBodies) {
			const response = await registerRequest(invalid);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "Invalid registration." });
		}

		expect(createUser).not.toHaveBeenCalled();
	});

	it("returns 409 when the username is already registered", async () => {
		vi.mocked(createUser).mockRejectedValue(new UserAlreadyRegisteredError());

		const response = await registerRequest({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "other@school.edu",
			password: clientHash,
		});

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "Username or email is already registered.",
		});
	});

	it("returns 409 when the email is already registered", async () => {
		vi.mocked(createUser).mockRejectedValue(new UserAlreadyRegisteredError());

		const response = await registerRequest({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "other",
			email: "ada@school.edu",
			password: clientHash,
		});

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "Username or email is already registered.",
		});
	});
});
