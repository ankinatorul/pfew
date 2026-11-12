import type { AdditionState } from "../../lib/readiness";
declare global {
  interface Window {
    packingFixtureAdd: (form: FormData) => Promise<AdditionState>;
  }
}
export async function addReviewedPacking(
  _state: AdditionState,
  form: FormData,
) {
  return window.packingFixtureAdd(form);
}
export async function addReviewedPrep() {
  return { error: "Use the reminder editor in this isolated fixture." };
}
