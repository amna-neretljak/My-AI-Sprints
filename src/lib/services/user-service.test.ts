import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
	createUser,
	deleteUser,
	findByUsernameOrEmail,
	updateUser,
	verifyPassword,
} from "@/lib/services/user-service";

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(),
}));

type StatementCall = {
	sql: string;
	args: unknown[];
};

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash: string;
};

function mockDb(options?: { results?: UserRow[]; uniqueConstraint?: string }) {
	const calls: StatementCall[] = [];
	const db = {
		prepare(sql: string) {
			return {
				bind(...args: unknown[]) {
					calls.push({ sql, args });
					return {
						async run() {
							if (options?.uniqueConstraint) {
								throw new Error(`UNIQUE constraint failed: ${options.uniqueConstraint}`);
							}
							return { success: true };
						},
						async all() {
							return { results: options?.results ?? [] };
						},
					};
				},
			};
		},
	};

	vi.mocked(getDb).mockResolvedValue(db as Awaited<ReturnType<typeof getDb>>);
	return calls;
}

const clientHash = "c".repeat(64);

const adaRow: UserRow = {
	id: "user-1",
	first_name: "Ada",
	last_name: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	password_hash: "stored-hash",
};

describe("user service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("stores a server hash and returns a public user without password_hash", async () => {
		const calls = mockDb({ results: [adaRow] });

		const user = await createUser({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
			password: clientHash,
		});

		expect(user).toEqual({
			id: "user-1",
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
		});
		expect(user).not.toHaveProperty("password_hash");
		expect(user).not.toHaveProperty("passwordHash");

		const insert = calls.find((call) => call.sql.includes("INSERT"));
		expect(insert?.args).toEqual([
			"Ada",
			"Lovelace",
			"ada",
			"ada@school.edu",
			expect.stringMatching(/^pbkdf2-sha256\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/),
		]);
		expect(insert?.args[4]).not.toBe(clientHash);
	});

	it("accepts a username and email that are the same string", async () => {
		const calls = mockDb({
			results: [{ ...adaRow, username: "ada@school.edu", email: "ada@school.edu" }],
		});

		const user = await createUser({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada@school.edu",
			email: "ada@school.edu",
			password: clientHash,
		});

		const insert = calls.find((call) => call.sql.includes("INSERT"));
		expect(insert?.args[2]).toBe("ada@school.edu");
		expect(insert?.args[3]).toBe("ada@school.edu");
		expect(user.username).toBe(user.email);
	});

	it("turns a duplicate username or email into the already-registered error", async () => {
		const input = {
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
			password: clientHash,
		};

		mockDb({ uniqueConstraint: "users.username" });
		await expect(createUser(input)).rejects.toThrow("Username or email is already registered.");

		mockDb({ uniqueConstraint: "users.email" });
		await expect(createUser(input)).rejects.toThrow("Username or email is already registered.");
	});

	it("looks up a user by username or email with one bound identifier", async () => {
		const calls = mockDb({ results: [adaRow] });

		const user = await findByUsernameOrEmail("ada@school.edu");

		expect(user).toEqual({
			id: "user-1",
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
			passwordHash: "stored-hash",
		});

		const select = calls.find((call) => call.sql.includes("SELECT"));
		expect(select?.sql).toMatch(/username\s*=\s*\?1\s+OR\s+email\s*=\s*\?1/i);
		expect(select?.args).toEqual(["ada@school.edu"]);

		mockDb({ results: [] });
		expect(await findByUsernameOrEmail("missing")).toBeNull();
	});

	it("rejects a missing user and checks the stored hash when the user exists", async () => {
		const stored = await hashPassword(clientHash);
		mockDb({ results: [] });
		expect(await verifyPassword("ada", clientHash)).toBe(false);

		mockDb({ results: [{ ...adaRow, password_hash: stored }] });
		expect(await verifyPassword("ada", clientHash)).toBe(true);
		expect(await verifyPassword("ada", "d".repeat(64))).toBe(false);
	});

	it("updates and deletes a user without changing password_hash", async () => {
		const calls = mockDb({
			results: [
				{
					...adaRow,
					first_name: "Grace",
					last_name: "Hopper",
					username: "grace",
					email: "grace@school.edu",
				},
			],
		});

		const updated = await updateUser("user-1", {
			firstName: "Grace",
			lastName: "Hopper",
			username: "grace",
			email: "grace@school.edu",
		});

		expect(updated).toEqual({
			id: "user-1",
			firstName: "Grace",
			lastName: "Hopper",
			username: "grace",
			email: "grace@school.edu",
		});
		expect(updated).not.toHaveProperty("passwordHash");

		await deleteUser("user-1");

		const update = calls.find((call) => /UPDATE/i.test(call.sql));
		const remove = calls.find((call) => /DELETE/i.test(call.sql));
		expect(update?.sql).not.toMatch(/password_hash/);
		expect(update?.args).toEqual(["Grace", "Hopper", "grace", "grace@school.edu", "user-1"]);
		expect(remove?.sql).not.toMatch(/password_hash/);
		expect(remove?.args).toEqual(["user-1"]);
	});
});
