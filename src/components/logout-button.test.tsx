import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}));

describe("LogoutButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("calls logout and then navigates to /login", async () => {
		const user = userEvent.setup();
		const push = vi.fn();
		vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ ok: true }),
		} as Response);

		render(<LogoutButton />);
		await user.click(screen.getByRole("button", { name: "Log out" }));

		await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" }));
		expect(push).toHaveBeenCalledWith("/login");
	});
});
