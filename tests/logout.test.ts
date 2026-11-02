import { afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error("redirect:" + url);
  }),
}));
vi.mock("../lib/supabase", () => ({
  supabase: async () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../lib/access", () => ({ access: vi.fn() }));
import { logout } from "../app/actions";
afterEach(() => vi.clearAllMocks());
it("signs out this session and invalidates the header and protected page cache", async () => {
  mocks.signOut.mockResolvedValue({ error: null });
  await expect(logout()).rejects.toThrow("redirect:/login");
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
});
it("reports sign-out failures without claiming success", async () => {
  mocks.signOut.mockResolvedValue({ error: { message: "network" } });
  await expect(logout()).rejects.toThrow("redirect:/error?");
  expect(mocks.revalidate).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalledWith("/login");
});
