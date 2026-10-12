export async function digestPassword(password: string): Promise<string> {
	const bytes = new TextEncoder().encode(password);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
