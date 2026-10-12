import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type WranglerConfig = {
	d1_databases?: Array<{
		binding?: string;
		database_name?: string;
		database_id?: string;
	}>;
};

type Column = {
	name: string;
	unique: boolean;
};

const root = process.cwd();

function parseJsonc(source: string): WranglerConfig {
	const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
	const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, "");
	return JSON.parse(withoutLineComments) as WranglerConfig;
}

function usersColumnDefinitions(sql: string): Column[] {
	const match = sql.match(/CREATE\s+TABLE\s+users\s*\(/i);
	if (!match || match.index === undefined) {
		throw new Error("CREATE TABLE users is missing");
	}

	const start = match.index + match[0].length;
	let depth = 1;
	let end = start;
	for (; end < sql.length; end += 1) {
		const char = sql[end];
		if (char === "(") depth += 1;
		if (char === ")") {
			depth -= 1;
			if (depth === 0) break;
		}
	}

	const body = sql.slice(start, end);
	const parts: string[] = [];
	let current = "";
	depth = 0;
	for (const char of body) {
		if (char === "(") depth += 1;
		if (char === ")") depth -= 1;
		if (char === "," && depth === 0) {
			parts.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim()) parts.push(current);

	return parts.map((part) => {
		const trimmed = part.trim();
		const name = trimmed.split(/\s+/)[0]?.replace(/["`[\]]/g, "");
		if (!name) {
			throw new Error(`Could not read a column from: ${trimmed}`);
		}
		return { name, unique: /\bUNIQUE\b/i.test(trimmed) };
	});
}

function createUsersMigrationSql(): string {
	const files = readdirSync(join(root, "migrations")).filter((name) =>
		name.endsWith("_create-users.sql"),
	);
	expect(files).toHaveLength(1);
	return readFileSync(join(root, "migrations", files[0]), "utf8");
}

describe("users database", () => {
	it("binds the my-ai-sprints D1 database as DB", () => {
		const config = parseJsonc(readFileSync(join(root, "wrangler.jsonc"), "utf8"));

		expect(config.d1_databases).toEqual([
			expect.objectContaining({
				binding: "DB",
				database_name: "my-ai-sprints",
				database_id: expect.any(String),
			}),
		]);
		expect(config.d1_databases?.[0]?.database_id).not.toEqual("");
	});

	it("creates users with a password hash and unique username and email", () => {
		const columns = usersColumnDefinitions(createUsersMigrationSql());

		expect(columns.map((column) => column.name)).toEqual([
			"id",
			"first_name",
			"last_name",
			"username",
			"email",
			"password_hash",
			"created_at",
			"updated_at",
		]);
		expect(columns.find((column) => column.name === "username")?.unique).toBe(true);
		expect(columns.find((column) => column.name === "email")?.unique).toBe(true);
		expect(columns.some((column) => column.name === "password")).toBe(false);
	});

	it("does not add a second index on username or email", () => {
		const sql = createUsersMigrationSql();

		expect(sql).not.toContain("IDX_users_user_name");
		expect(sql).not.toContain("IDX_users_email");
	});
});
