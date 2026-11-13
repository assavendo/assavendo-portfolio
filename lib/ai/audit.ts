import { supabaseAdmin } from "@/lib/supabase/server";

export async function auditAiEvent(input: {
  actorId: string;
  actorType?: "user" | "agent" | "system" | "workflow" | "provider";
  action: string;
  resourceType?: string;
  resourceId?: string;
  policyDecision?: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "REQUIRE_STEP_UP_AUTH" | "RATE_LIMIT" | "SAFE_MODE_ONLY";
  result?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin().from("ai_audit_logs").insert({
    actor_type: input.actorType ?? "user",
    actor_id: input.actorId,
    user_id: input.actorType === "user" ? input.actorId : null,
    service: "ai-control-plane",
    action: input.action,
    resource_type: input.resourceType ?? null,
    resource_id: input.resourceId ?? null,
    policy_decision: input.policyDecision ?? "ALLOW",
    result: input.result ?? null,
    error: input.error ?? null,
    metadata: input.metadata ?? {},
  });
}
