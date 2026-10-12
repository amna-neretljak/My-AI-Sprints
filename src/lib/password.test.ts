import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

const clientHash = "a".repeat(64);
const otherHash = "b".repeat(64);
const storedHashPattern = /^pbkdf2-sha256\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/;

describe("hashPassword", () => {
	it("stores a salted PBKDF2 string and not the browser digest", async () => {
		const stored = await hashPassword(clientHash);

		expect(stored).toMatch(storedHashPattern);
		expect(stored).not.toBe(clientHash);
		expect(stored.split("$")[3]).not.toBe(clientHash);
	});

	it("uses a different salt for each hash of the same digest", async () => {
		const first = await hashPassword(clientHash);
		const second = await hashPassword(clientHash);

		expect(first.split("$")[2]).not.toBe(second.split("$")[2]);
	});
});

describe("verifyPassword", () => {
	it("accepts the matching digest and rejects a different one", async () => {
		const stored = await hashPassword(clientHash);

		expect(await verifyPassword(stored, clientHash)).toBe(true);
		expect(await verifyPassword(stored, otherHash)).toBe(false);
	});

	it("rejects a stored value that is not a PBKDF2 string", async () => {
		expect(await verifyPassword(clientHash, clientHash)).toBe(false);
		expect(await verifyPassword("plain-text-password", clientHash)).toBe(false);
	});
});
