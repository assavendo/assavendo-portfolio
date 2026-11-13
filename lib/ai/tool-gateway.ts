import { supabaseAdmin } from "@/lib/supabase/server";
import { evaluateAiPolicy, validateToolInput } from "./policy-engine";

export type PolicyDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "REQUIRE_STEP_UP_AUTH" | "RATE_LIMIT" | "SAFE_MODE_ONLY";

export type ToolRequest = {
  agentSlug: string;
  toolSlug: string;
  actorId?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  policySlug?: string | null;
  input: Record<string, unknown>;
  mode: "FULL" | "DEGRADED" | "SAFE" | "NO_AI" | "MAINTENANCE";
};

export type ToolAuthorization = {
  decision: PolicyDecision;
  reason: string;
  requiresApproval: boolean;
  policySlug?: string;
  policyVersion?: number | null;
};

export async function authorizeToolCall(request: ToolRequest): Promise<ToolAuthorization> {
  const db = supabaseAdmin();
  const [{ data: tool }, { data: binding }] = await Promise.all([
    db.from("ai_tools").select("slug,enabled,risk_level,requires_approval,input_schema,version").eq("slug", request.toolSlug).maybeSingle(),
    db.from("ai_agent_tools").select("allowed").eq("agent_slug", request.agentSlug).eq("tool_slug", request.toolSlug).maybeSingle(),
  ]);

  if (request.mode === "NO_AI" || request.mode === "MAINTENANCE") {
    return { decision: "SAFE_MODE_ONLY", reason: `Le mode ${request.mode} interdit l'exécution des outils IA.`, requiresApproval: false };
  }
  if (!tool || !tool.enabled) return { decision: "DENY", reason: "Outil non activé.", requiresApproval: false };
  if (!binding?.allowed) return { decision: "DENY", reason: "Agent non autorisé pour cet outil.", requiresApproval: false };

  const riskRank = { low: 0, medium: 1, high: 2, critical: 3 };
  const requestedRisk = request.riskLevel ?? (tool.risk_level as keyof typeof riskRank) ?? "medium";
  const requestedRank = riskRank[requestedRisk] ?? 1;
  const configuredRank = riskRank[tool.risk_level as keyof typeof riskRank] ?? 1;
  if (requestedRank < configuredRank) return { decision: "DENY", reason: "Niveau de risque incohérent.", requiresApproval: false };

  const schemaError = validateToolInput(tool.input_schema, request.input);
  if (schemaError) return { decision: "DENY", reason: schemaError, requiresApproval: false };

  const policy = await evaluateAiPolicy({
    policySlug: request.policySlug,
    agentSlug: request.agentSlug,
    toolSlug: request.toolSlug,
    riskLevel: requestedRisk,
    mode: request.mode,
    payload: request.input,
  });

  if (!policy.allowed) {
    return {
      decision: policy.decision,
      reason: policy.reason,
      requiresApproval: policy.decision === "REQUIRE_APPROVAL" || policy.decision === "REQUIRE_STEP_UP_AUTH",
      policySlug: policy.policySlug,
      policyVersion: policy.policyVersion,
    };
  }

  if (request.mode === "SAFE" && requestedRank >= 1) {
    return {
      decision: requestedRank >= 3 ? "REQUIRE_STEP_UP_AUTH" : "REQUIRE_APPROVAL",
      reason: "Le mode SAFE soumet les outils non strictement lecture à validation humaine.",
      requiresApproval: true,
      policySlug: policy.policySlug,
      policyVersion: policy.policyVersion,
    };
  }

  if (tool.requires_approval || requestedRank >= 2) {
    return {
      decision: requestedRank >= 3 ? "REQUIRE_STEP_UP_AUTH" : "REQUIRE_APPROVAL",
      reason: "Outil à risque soumis à validation humaine.",
      requiresApproval: true,
      policySlug: policy.policySlug,
      policyVersion: policy.policyVersion,
    };
  }

  return { decision: "ALLOW", reason: policy.reason, requiresApproval: false, policySlug: policy.policySlug, policyVersion: policy.policyVersion };
}

export async function recordToolDecision(request: ToolRequest, authorization: ToolAuthorization, result?: string, error?: string) {
  await supabaseAdmin().from("ai_audit_logs").insert({
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
      policy_slug: authorization.policySlug ?? null,
      policy_version: authorization.policyVersion ?? null,
      input_keys: Object.keys(request.input).slice(0, 50),
    },
  });
}
