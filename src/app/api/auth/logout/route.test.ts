import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createUser,
	deleteUser,
	findByUsernameOrEmail,
	updateUser,
} from "@/lib/services/user-service";
import { POST } from "@/app/api/auth/logout/route";

vi.mock("@/lib/services/user-service", () => ({
	createUser: vi.fn(),
	findByUsernameOrEmail: vi.fn(),
	verifyPassword: vi.fn(),
	updateUser: vi.fn(),
	deleteUser: vi.fn(),
}));

describe("POST /api/auth/logout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and does not read or write users", async () => {
		const response = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(createUser).not.toHaveBeenCalled();
		expect(findByUsernameOrEmail).not.toHaveBeenCalled();
		expect(updateUser).not.toHaveBeenCalled();
		expect(deleteUser).not.toHaveBeenCalled();
	});
});
