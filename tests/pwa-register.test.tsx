// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, it, expect, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { PWARegister } from "../components/pwa-register";
import { saveSnapshot, listSnapshots } from "../public/offline-store.js";

function registration(
  scriptURL: string,
  scope = new URL("/", location.href).href,
) {
  return {
    scope,
    active: { scriptURL },
    waiting: null,
    installing: null,
    unregister: vi.fn().mockResolvedValue(true),
  };
}
function serviceWorkers(registrations: unknown[] = []) {
  const serviceWorker = {
    getRegistrations: vi.fn().mockResolvedValue(registrations),
    register: vi.fn().mockResolvedValue({}),
  };
  vi.stubGlobal("navigator", { serviceWorker });
  return serviceWorker;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("does not automatically install an offline navigation worker in development", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const worker = serviceWorkers();
  render(<PWARegister />);
  await waitFor(() => expect(worker.getRegistrations).toHaveBeenCalledOnce());
  expect(worker.register).not.toHaveBeenCalled();
});

it("unregisters only Pfew's root worker and preserves cached assets and saved offline copies", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const saved = {
    version: 1,
    salt: "fixture-salt",
    iv: "fixture-iv",
    ciphertext: "opaque-fixture",
  };
  await saveSnapshot("fixture-user", "fixture-trip", saved);
  const before = await listSnapshots();
  const pfew = registration(new URL("/sw.js", location.href).href);
  const otherScript = registration(
    new URL("/another-app.js", location.href).href,
  );
  const otherScope = registration(
    new URL("/sw.js", location.href).href,
    new URL("/another-app/", location.href).href,
  );
  const otherOrigin = registration("https://another.example/sw.js");
  const worker = serviceWorkers([pfew, otherScript, otherScope, otherOrigin]);
  const deleteCache = vi.fn();
  vi.stubGlobal("caches", { delete: deleteCache });
  render(<PWARegister />);
  await waitFor(() => expect(pfew.unregister).toHaveBeenCalledOnce());
  for (const other of [otherScript, otherScope, otherOrigin])
    expect(other.unregister).not.toHaveBeenCalled();
  expect(worker.register).not.toHaveBeenCalled();
  expect(deleteCache).not.toHaveBeenCalled();
  expect(await listSnapshots()).toEqual(before);
});

it.each(["waiting", "installing"] as const)(
  "also removes a stale Pfew worker in the %s state",
  async (state) => {
    vi.stubEnv("NODE_ENV", "development");
    const pfew = {
      ...registration(new URL("/sw.js", location.href).href),
      active: null,
      [state]: { scriptURL: new URL("/sw.js", location.href).href },
    };
    serviceWorkers([pfew]);
    render(<PWARegister />);
    await waitFor(() => expect(pfew.unregister).toHaveBeenCalledOnce());
  },
);

it("retains normal production registration without unregistering any workers", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const worker = serviceWorkers();
  render(<PWARegister />);
  await waitFor(() =>
    expect(worker.register).toHaveBeenCalledWith("/sw.js", { scope: "/" }),
  );
  expect(worker.getRegistrations).not.toHaveBeenCalled();
});

it("does not block rendering when browser worker cleanup is denied", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const pfew = registration(new URL("/sw.js", location.href).href);
  pfew.unregister.mockRejectedValue(new Error("Browser denied cleanup"));
  const worker = serviceWorkers([pfew]);
  render(<PWARegister />);
  await waitFor(() => expect(pfew.unregister).toHaveBeenCalledOnce());
  expect(worker.register).not.toHaveBeenCalled();
});

it("tolerates browsers without service worker support", () => {
  vi.stubGlobal("navigator", {});
  expect(() => render(<PWARegister />)).not.toThrow();
});
