import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/login-form";

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}));

const passwordDigest = "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8";

function mockRouter() {
	const push = vi.fn();
	vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
	return push;
}

describe("LoginForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("hashes the password before the request", async () => {
		const user = userEvent.setup();
		mockRouter();
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ user: { id: "user-1" } }),
		} as Response);

		render(<LoginForm />);
		await user.type(screen.getByLabelText("Username or email"), "ada");
		await user.type(screen.getByLabelText("Password"), "password");
		await user.click(screen.getByRole("button", { name: "Login" }));

		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/login",
			expect.objectContaining({
				method: "POST",
				headers: { "Content-Type": "application/json" },
			}),
		);
		const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
		expect(body).toEqual({
			identifier: "ada",
			password: passwordDigest,
		});
	});

	it("shows the bad-credentials error from a 401", async () => {
		const user = userEvent.setup();
		mockRouter();
		vi.mocked(fetch).mockResolvedValue({
			ok: false,
			status: 401,
			json: async () => ({ error: "Invalid username, email, or password." }),
		} as Response);

		render(<LoginForm />);
		await user.type(screen.getByLabelText("Username or email"), "ada");
		await user.type(screen.getByLabelText("Password"), "password");
		await user.click(screen.getByRole("button", { name: "Login" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"Invalid username, email, or password.",
		);
	});

	it("navigates to /mcq after a successful login", async () => {
		const user = userEvent.setup();
		const push = mockRouter();
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ user: { id: "user-1" } }),
		} as Response);

		render(<LoginForm />);
		await user.type(screen.getByLabelText("Username or email"), "ada@school.edu");
		await user.type(screen.getByLabelText("Password"), "password");
		await user.click(screen.getByRole("button", { name: "Login" }));

		await waitFor(() => expect(push).toHaveBeenCalledWith("/mcq"));
	});
});
