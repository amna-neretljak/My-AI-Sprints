import { describe, expect, it } from "vitest";
import { digestPassword } from "@/lib/password-client";

const sha256Password =
	"5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8";

describe("digestPassword", () => {
	it("returns the same 64-character lowercase SHA-256 hex every time", async () => {
		const first = await digestPassword("password");
		const second = await digestPassword("password");

		expect(first).toBe(sha256Password);
		expect(second).toBe(first);
		expect(first).toMatch(/^[0-9a-f]{64}$/);
	});

	it("returns a different digest for a different password", async () => {
		const password = await digestPassword("password");
		const other = await digestPassword("password2");

		expect(other).not.toBe(password);
		expect(other).toMatch(/^[0-9a-f]{64}$/);
	});
});
