import { timingSafeEqual } from "node:crypto";

const ITERATIONS = 100_000;
const STORED_PREFIX = "pbkdf2-sha256";

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
	if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) {
		return null;
	}

	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
}

async function deriveBits(
	clientHash: string,
	salt: Uint8Array<ArrayBuffer>,
	iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(clientHash), "PBKDF2", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt,
			iterations,
		},
		key,
		256,
	);
	return new Uint8Array(bits);
}

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) {
		return false;
	}
	return timingSafeEqual(left, right);
}

export async function hashPassword(clientHash: string): Promise<string> {
	const salt = new Uint8Array(16);
	crypto.getRandomValues(salt);
	const derived = await deriveBits(clientHash, salt, ITERATIONS);
	return `${STORED_PREFIX}$${ITERATIONS}$${toHex(salt)}$${toHex(derived)}`;
}

export async function verifyPassword(stored: string, clientHash: string): Promise<boolean> {
	const [prefix, iterationText, saltHex, derivedHex] = stored.split("$");
	if (prefix !== STORED_PREFIX || iterationText !== String(ITERATIONS) || !saltHex || !derivedHex) {
		return false;
	}

	const salt = fromHex(saltHex);
	const expected = fromHex(derivedHex);
	if (!salt || salt.length !== 16 || !expected || expected.length !== 32) {
		return false;
	}

	const actual = await deriveBits(clientHash, salt, ITERATIONS);
	return safeEqual(actual, expected);
}
