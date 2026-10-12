import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRouter } from "next/navigation";
import { RegisterForm } from "@/components/register-form";

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}));

const passwordDigest = "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8";

function mockRouter() {
	const push = vi.fn();
	vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
	return push;
}

async function fillValidAccount(user: ReturnType<typeof userEvent.setup>, username = "ada", email = "ada@school.edu") {
	await user.type(screen.getByLabelText("First name"), "Ada");
	await user.type(screen.getByLabelText("Last name"), "Lovelace");
	await user.type(screen.getByLabelText("Username"), username);
	await user.type(screen.getByLabelText("Email"), email);
	await user.type(screen.getByLabelText("Password"), "password");
	await user.type(screen.getByLabelText("Confirm password"), "password");
}

describe("RegisterForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("hashes the password and omits the typed password and confirm password from the request", async () => {
		const user = userEvent.setup();
		mockRouter();
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ user: { id: "user-1" } }),
		} as Response);

		render(<RegisterForm />);
		await fillValidAccount(user);
		await user.click(screen.getByRole("button", { name: "Create Account" }));

		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/register",
			expect.objectContaining({
				method: "POST",
				headers: { "Content-Type": "application/json" },
			}),
		);
		const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
		expect(body).toEqual({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
			password: passwordDigest,
		});
		expect(body.password).toBe(passwordDigest);
		expect(body).not.toHaveProperty("confirmPassword");
	});

	it("accepts a username and email that are the same string", async () => {
		const user = userEvent.setup();
		mockRouter();
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ user: { id: "user-1" } }),
		} as Response);

		render(<RegisterForm />);
		await fillValidAccount(user, "ada@school.edu", "ada@school.edu");
		await user.click(screen.getByRole("button", { name: "Create Account" }));

		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
		expect(body.username).toBe("ada@school.edu");
		expect(body.email).toBe("ada@school.edu");
	});

	it("shows the duplicate-username error from a 409", async () => {
		const user = userEvent.setup();
		mockRouter();
		vi.mocked(fetch).mockResolvedValue({
			ok: false,
			status: 409,
			json: async () => ({ error: "Username or email is already registered." }),
		} as Response);

		render(<RegisterForm />);
		await fillValidAccount(user);
		await user.click(screen.getByRole("button", { name: "Create Account" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"Username or email is already registered.",
		);
	});

	it("navigates to /mcq after a successful registration", async () => {
		const user = userEvent.setup();
		const push = mockRouter();
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ user: { id: "user-1" } }),
		} as Response);

		render(<RegisterForm />);
		await fillValidAccount(user);
		await user.click(screen.getByRole("button", { name: "Create Account" }));

		await waitFor(() => expect(push).toHaveBeenCalledWith("/mcq"));
	});
});
