import { z } from "zod";
export const setupCheckSchema = z.object({
  id: z.string(),
  group: z.enum(["account", "database", "integrations", "verification"]),
  title: z.string(),
  state: z.enum([
    "passed",
    "needs_setup",
    "unknown",
    "configured",
    "optional",
    "not_tested",
  ]),
  detail: z.string(),
  code: z.string().optional(),
});
export type SetupCheck = z.infer<typeof setupCheckSchema>;
export const setupReportSchema = z.object({
  checkedAt: z.iso.datetime(),
  release: z.literal("phase-4"),
  schemaVersionRequired: z.literal(10),
  commit: z.string().nullable(),
  siteOrigin: z.string().nullable(),
  projectHost: z.string().nullable(),
  database: z.object({ passed: z.number(), total: z.number() }),
  checks: z.array(setupCheckSchema),
  scope: z.string(),
});
export type SetupReport = z.infer<typeof setupReportSchema>;
export const checkStateLabels: Record<SetupCheck["state"], string> = {
  passed: "Passed",
  needs_setup: "Needs setup",
  unknown: "Could not check",
  configured: "Configured · live test pending",
  optional: "Optional · not configured",
  not_tested: "Not tested",
};
