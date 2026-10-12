import { beforeEach, describe, expect, it, vi } from "vitest";
import { findByUsernameOrEmail, verifyPassword } from "@/lib/services/user-service";
import { POST } from "@/app/api/auth/login/route";

vi.mock("@/lib/services/user-service", () => ({
	createUser: vi.fn(),
	findByUsernameOrEmail: vi.fn(),
	verifyPassword: vi.fn(),
	updateUser: vi.fn(),
	deleteUser: vi.fn(),
	UserAlreadyRegisteredError: class UserAlreadyRegisteredError extends Error {},
}));

const clientHash = "a".repeat(64);
const storedUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	passwordHash: "pbkdf2-sha256$100000$salt$derived",
};
const publicUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
};

function loginRequest(body: unknown) {
	return POST(
		new Request("http://localhost/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/auth/login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and a public user when the username matches", async () => {
		vi.mocked(findByUsernameOrEmail).mockResolvedValue(storedUser);
		vi.mocked(verifyPassword).mockResolvedValue(true);

		const response = await loginRequest({
			identifier: "ada",
			password: clientHash,
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ user: publicUser });
		expect(JSON.stringify(body)).not.toContain("password_hash");
		expect(JSON.stringify(body)).not.toContain("passwordHash");
		expect(findByUsernameOrEmail).toHaveBeenCalledWith("ada");
		expect(verifyPassword).toHaveBeenCalledWith("ada", clientHash);
	});

	it("returns 200 and a public user when the email matches", async () => {
		vi.mocked(findByUsernameOrEmail).mockResolvedValue(storedUser);
		vi.mocked(verifyPassword).mockResolvedValue(true);

		const response = await loginRequest({
			identifier: "ada@school.edu",
			password: clientHash,
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ user: publicUser });
		expect(findByUsernameOrEmail).toHaveBeenCalledWith("ada@school.edu");
		expect(verifyPassword).toHaveBeenCalledWith("ada@school.edu", clientHash);
	});

	it("returns the same 401 when the identifier is unknown or the password is wrong", async () => {
		vi.mocked(findByUsernameOrEmail).mockResolvedValue(null);
		vi.mocked(verifyPassword).mockResolvedValue(false);

		const unknown = await loginRequest({
			identifier: "missing",
			password: clientHash,
		});
		expect(unknown.status).toBe(401);
		expect(await unknown.json()).toEqual({
			error: "Invalid username, email, or password.",
		});

		vi.mocked(findByUsernameOrEmail).mockResolvedValue(storedUser);
		vi.mocked(verifyPassword).mockResolvedValue(false);

		const wrongPassword = await loginRequest({
			identifier: "ada",
			password: "b".repeat(64),
		});
		expect(wrongPassword.status).toBe(401);
		expect(await wrongPassword.json()).toEqual({
			error: "Invalid username, email, or password.",
		});
	});

	it("returns 400 when the identifier is empty or the digest is not SHA-256 hex", async () => {
		const invalidBodies = [
			{ identifier: "   ", password: clientHash },
			{ identifier: "ada", password: "password" },
		];

		for (const invalid of invalidBodies) {
			const response = await loginRequest(invalid);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "Invalid login." });
		}

		expect(findByUsernameOrEmail).not.toHaveBeenCalled();
		expect(verifyPassword).not.toHaveBeenCalled();
	});
});
