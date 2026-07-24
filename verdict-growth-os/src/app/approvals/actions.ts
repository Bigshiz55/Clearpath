"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { decideApproval } from "@/lib/store";

const schema = z.object({
  id: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().max(500).optional(),
});

/**
 * Server action: approve or reject a queued action. Delegates the state
 * transition and audit-event creation to the pure engine + store. This is the
 * only interactive write in v1 and it never executes the underlying external
 * action — it only records the human decision.
 */
export async function decideApprovalAction(formData: FormData) {
  const parsed = schema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Invalid approval decision: ${parsed.error.message}`);
  }
  const { id, decision, reason } = parsed.data;
  decideApproval(id, decision, reason ?? (decision === "approved" ? "Approved by operator." : "Rejected by operator."));
  revalidatePath("/approvals");
  revalidatePath("/");
  revalidatePath("/audit");
}
