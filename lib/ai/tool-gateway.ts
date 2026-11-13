import { supabaseAdmin } from "@/lib/supabase/server";

export type PolicyDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "REQUIRE_STEP_UP_AUTH" | "RATE_LIMIT" | "SAFE_MODE_ONLY";

export type ToolRequest = {
  agentSlug: string;
  toolSlug: string;
  actorId?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  input: Record<string, unknown>;
  mode: "FULL" | "DEGRADED" | "SAFE" | "NO_AI" | "MAINTENANCE";
};

export type ToolAuthorization = {
  decision: PolicyDecision;
  reason: string;
  requiresApproval: boolean;
};

const SAFE_MODES = new Set(["FULL", "DEGRADED", "SAFE"]);

export async function authorizeToolCall(request: ToolRequest): Promise<ToolAuthorization> {
  if (!SAFE_MODES.has(request.mode)) return { decision: "SAFE_MODE_ONLY", reason: "Le mode IA interdit l'exécution des outils.", requiresApproval: false };

  const db = supabaseAdmin();
  const [{ data: tool }, { data: binding }] = await Promise.all([
    db.from("ai_tools").select("slug,enabled,risk_level,requires_approval").eq("slug", request.toolSlug).maybeSingle(),
    db.from("ai_agent_tools").select("allowed").eq("agent_slug", request.agentSlug).eq("tool_slug", request.toolSlug).maybeSingle(),
  ]);

  if (!tool || !tool.enabled) return { decision: "DENY", reason: "Outil non activé.", requiresApproval: false };
  if (!binding?.allowed) return { decision: "DENY", reason: "Agent non autorisé pour cet outil.", requiresApproval: false };

  const riskRank = { low: 0, medium: 1, high: 2, critical: 3 };
  const requestedRank = riskRank[request.riskLevel ?? tool.risk_level as keyof typeof riskRank] ?? 1;
  const configuredRank = riskRank[tool.risk_level as keyof typeof riskRank] ?? 1;
  if (requestedRank < configuredRank) return { decision: "DENY", reason: "Niveau de risque incohérent.", requiresApproval: false };

  if (tool.requires_approval || requestedRank >= 2) {
    return {
      decision: requestedRank >= 3 ? "REQUIRE_STEP_UP_AUTH" : "REQUIRE_APPROVAL",
      reason: "Outil à risque soumis à validation humaine.",
      requiresApproval: true,
    };
  }

  return { decision: "ALLOW", reason: "Allowlist et policy satisfaites.", requiresApproval: false };
}

export async function recordToolDecision(request: ToolRequest, authorization: ToolAuthorization, result?: string, error?: string) {
  const db = supabaseAdmin();
  await db.from("ai_audit_logs").insert({
    actor_type: "agent",
    actor_id: request.actorId ?? request.agentSlug,
    agent_id: request.agentSlug,
    service: "ai-tool-gateway",
    action: "tool_call",
    resource_type: "ai_tool",
    resource_id: request.toolSlug,
    policy_decision: authorization.decision,
    result,
    error,
    metadata: {
      risk_level: request.riskLevel ?? "medium",
      requires_approval: authorization.requiresApproval,
      input_keys: Object.keys(request.input).slice(0, 50),
    },
  });
}
