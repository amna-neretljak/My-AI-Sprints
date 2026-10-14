import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Column = {
	name: string;
	definition: string;
};

const root = process.cwd();

function migrationSql(suffix: string): string {
	const files = readdirSync(join(root, "migrations")).filter((name) => name.endsWith(suffix));
	expect(files).toHaveLength(1);
	return readFileSync(join(root, "migrations", files[0]), "utf8");
}

function columnDefinitions(sql: string, table: string): Column[] {
	const match = sql.match(new RegExp(`CREATE\\s+TABLE\\s+${table}\\s*\\(`, "i"));
	if (!match || match.index === undefined) {
		throw new Error(`CREATE TABLE ${table} is missing`);
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
		const definition = part.trim().replace(/\s+/g, " ");
		const name = definition.split(" ")[0]?.replace(/["`[\]]/g, "");
		if (!name) {
			throw new Error(`Could not read a column from: ${definition}`);
		}
		return { name, definition };
	});
}

function column(columns: Column[], name: string): string {
	const found = columns.find((item) => item.name === name);
	if (!found) {
		throw new Error(`Column ${name} is missing`);
	}
	return found.definition;
}

describe("mcq database", () => {
	it("creates questions with a required name and question linked to users", () => {
		const columns = columnDefinitions(migrationSql("_create-mcq.sql"), "questions");

		expect(columns.map((item) => item.name)).toEqual([
			"id",
			"user_id",
			"name",
			"question",
			"created_at",
			"updated_at",
		]);
		expect(column(columns, "name")).toMatch(/\bNOT NULL\b/i);
		expect(column(columns, "question")).toMatch(/\bNOT NULL\b/i);
		expect(column(columns, "user_id")).toMatch(/\bNOT NULL\b/i);
		expect(column(columns, "user_id")).toMatch(/REFERENCES users\s*\(id\)/i);
		expect(columns.some((item) => item.name === "description")).toBe(false);
	});

	it("creates choices that cascade with their question", () => {
		const columns = columnDefinitions(migrationSql("_create-mcq.sql"), "choices");

		expect(columns.map((item) => item.name)).toEqual([
			"id",
			"question_id",
			"text",
			"is_correct",
			"position",
			"created_at",
			"updated_at",
		]);
		expect(column(columns, "question_id")).toMatch(
			/REFERENCES questions\s*\(id\) ON DELETE CASCADE/i,
		);
		expect(column(columns, "is_correct")).toMatch(/CHECK \(is_correct IN \(0, 1\)\)/i);
		expect(column(columns, "position")).toMatch(/CHECK \(position BETWEEN 0 AND 5\)/i);
	});

	it("creates attempts linked to users, questions, and choices", () => {
		const columns = columnDefinitions(migrationSql("_create-mcq.sql"), "attempts");

		expect(columns.map((item) => item.name)).toEqual([
			"id",
			"user_id",
			"question_id",
			"choice_id",
			"is_correct",
			"created_at",
		]);
		expect(column(columns, "user_id")).toMatch(/REFERENCES users\s*\(id\) ON DELETE CASCADE/i);
		expect(column(columns, "question_id")).toMatch(
			/REFERENCES questions\s*\(id\) ON DELETE CASCADE/i,
		);
		expect(column(columns, "choice_id")).toMatch(
			/REFERENCES choices\s*\(id\) ON DELETE CASCADE/i,
		);
		expect(column(columns, "is_correct")).toMatch(/\bNOT NULL\b/i);
	});

	it("indexes every foreign-key column", () => {
		const sql = migrationSql("_create-mcq.sql").replace(/\s+/g, " ");

		expect(sql).toMatch(/CREATE INDEX idx_questions_user_id ON questions\s*\(user_id\)/i);
		expect(sql).toMatch(/CREATE INDEX idx_choices_question_id ON choices\s*\(question_id\)/i);
		expect(sql).toMatch(/CREATE INDEX idx_attempts_question_id ON attempts\s*\(question_id\)/i);
		expect(sql).toMatch(/CREATE INDEX idx_attempts_user_id ON attempts\s*\(user_id\)/i);
	});

	it("leaves the users migration untouched", () => {
		const sql = migrationSql("_create-users.sql");

		expect(sql).not.toMatch(/\b(questions|choices|attempts)\b/i);
	});
});
