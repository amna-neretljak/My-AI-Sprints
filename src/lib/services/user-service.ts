import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword as storedPasswordMatches } from "@/lib/password";

export type PublicUser = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
};

export type UserRecord = PublicUser & {
	passwordHash: string;
};

export type CreateUserInput = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	password: string;
};

export type UpdateUserInput = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
};

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash: string;
};

export class UserAlreadyRegisteredError extends Error {
	constructor() {
		super("Username or email is already registered.");
		this.name = "UserAlreadyRegisteredError";
	}
}

function isUniqueConstraintError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

function toPublicUser(row: UserRow): PublicUser {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
	};
}

function toUserRecord(row: UserRow): UserRecord {
	return {
		...toPublicUser(row),
		passwordHash: row.password_hash,
	};
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
	const db = await getDb();
	const passwordHash = await hashPassword(input.password);

	try {
		await db
			.prepare(
				`INSERT INTO users (first_name, last_name, username, email, password_hash)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
			)
			.bind(input.firstName, input.lastName, input.username, input.email, passwordHash)
			.run();
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new UserAlreadyRegisteredError();
		}
		throw error;
	}

	const { results } = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email, password_hash
       FROM users
       WHERE username = ?1`,
		)
		.bind(input.username)
		.all<UserRow>();
	const row = results[0];
	if (!row) {
		throw new Error("Unable to create user.");
	}
	return toPublicUser(row);
}

export async function findByUsernameOrEmail(identifier: string): Promise<UserRecord | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email, password_hash
       FROM users
       WHERE username = ?1 OR email = ?1`,
		)
		.bind(identifier)
		.all<UserRow>();
	const row = results[0];
	return row ? toUserRecord(row) : null;
}

export async function verifyPassword(identifier: string, clientHash: string): Promise<boolean> {
	const user = await findByUsernameOrEmail(identifier);
	if (!user) {
		return false;
	}
	return storedPasswordMatches(user.passwordHash, clientHash);
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<PublicUser> {
	const db = await getDb();

	try {
		await db
			.prepare(
				`UPDATE users
         SET first_name = ?1, last_name = ?2, username = ?3, email = ?4, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?5`,
			)
			.bind(input.firstName, input.lastName, input.username, input.email, id)
			.run();
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new UserAlreadyRegisteredError();
		}
		throw error;
	}

	const { results } = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email, password_hash
       FROM users
       WHERE id = ?1`,
		)
		.bind(id)
		.all<UserRow>();
	const row = results[0];
	if (!row) {
		throw new Error("Unable to update user.");
	}
	return toPublicUser(row);
}

export async function deleteUser(id: string): Promise<void> {
	const db = await getDb();
	await db.prepare(`DELETE FROM users WHERE id = ?1`).bind(id).run();
}
