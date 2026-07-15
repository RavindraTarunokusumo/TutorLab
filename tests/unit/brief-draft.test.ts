import { describe, expect, it, vi } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "@/lib/projects/brief-draft";

describe("teaching brief browser drafts", () => {
  it("does not throw when browser storage is unavailable", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(() => loadDraft("project-alpha")).not.toThrow();
    expect(() => saveDraft("project-alpha", { purpose: "guided_practice" })).not.toThrow();
    expect(() => clearDraft("project-alpha")).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
    removeItem.mockRestore();
  });
});
