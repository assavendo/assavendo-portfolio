import { supabaseAdmin } from "@/lib/supabase/server";
import { runAgent } from "./router";
import { authorizeToolCall, recordToolDecision } from "./tool-gateway";

type WorkflowRow = {
  id: string;
  slug: string;
  version: number;
  name: string;
  trigger_type: "manual" | "event" | "schedule" | "condition";
  status: "draft" | "active" | "paused" | "disabled" | "archived";
  definition: Record<string, unknown>;
  next_run_at: string | null;
  concurrency_limit: number;
  max_retries: number;
};

function intervalMs(definition: Record<string, unknown>): number {
  const minutes = Number(definition.interval_minutes ?? 0);
  if (!Number.isFinite(minutes) || minutes < 1) return 0;
  return Math.min(minutes, 24 * 60) * 60_000;
}

async function claimRun(db: ReturnType<typeof supabaseAdmin>, workflow: WorkflowRow, now: string) {
  const key = `${workflow.id}:${workflow.next_run_at ?? now}`;
  const { data: inserted, error: insertError } = await db.from("ai_workflow_runs").insert({
    workflow_id: workflow.id,
    idempotency_key: key,
    trigger_type: workflow.trigger_type,
    status: "queued",
    context: { source: "vercel-cron", scheduled_at: workflow.next_run_at ?? now },
  }).select("id").maybeSingle();

  if (insertError && insertError.code !== "23505") return null;
  const runId = inserted?.id ?? (await db.from("ai_workflow_runs").select("id").eq("workflow_id", workflow.id).eq("idempotency_key", key).maybeSingle()).data?.id;
  if (!runId) return null;

  const { data: claimed } = await db.from("ai_workflow_runs").update({
    status: "running",
    started_at: now,
    attempt: 1,
  }).eq("id", runId).eq("status", "queued").select("id").maybeSingle();

  return claimed?.id ? String(claimed.id) : null;
}

async function executeStep(
  workflow: WorkflowRow,
  step: { action: string; agent_slug: string | null; tool_slug: string | null; policy_slug: string | null; required_approval: boolean; config: Record<string, unknown> },
  context: Record<string, unknown>,
) {
  if (step.action === "noop") return { ok: true, result: { status: "noop" } };

  if (step.action === "agent.run") {
    const agent = step.agent_slug;
    if (agent !== "support" && agent !== "recherche" && agent !== "catalogue") {
      return { ok: false, error: "Cet agent n'est pas encore relié au runtime d'exécution." };
    }
    const prompt = typeof step.config.prompt === "string" ? step.config.prompt : typeof context.prompt === "string" ? context.prompt : "";
    if (!prompt.trim()) return { ok: false, error: "Prompt de workflow absent." };
    const result = await runAgent(agent, [{ role: "user", content: prompt }], { json: Boolean(step.config.json) });
    return result.ok ? { ok: true, result: { text: result.text, provider: result.provider, model: result.model, cost: result.estimatedCostUsd } } : { ok: false, error: result.error };
  }

  if (step.action === "tool.authorize") {
    if (!step.tool_slug) return { ok: false, error: "Outil de workflow absent." };
    const mode = typeof context.mode === "string" ? context.mode : "SAFE";
    const request = {
      agentSlug: step.agent_slug ?? "supervisor",
      toolSlug: step.tool_slug,
      actorId: typeof context.actor_id === "string" ? context.actor_id : undefined,
      riskLevel: step.required_approval ? "high" as const : "medium" as const,
      input: context,
      mode: mode as "FULL" | "DEGRADED" | "SAFE" | "NO_AI" | "MAINTENANCE",
    };
    const decision = await authorizeToolCall(request);
    await recordToolDecision(request, decision, decision.decision === "ALLOW" ? "authorized" : undefined, decision.decision === "ALLOW" ? undefined : decision.reason);
    return decision.decision === "ALLOW"
      ? { ok: true, result: { decision: decision.decision } }
      : { ok: false, error: decision.reason, waitingApproval: decision.requiresApproval };
  }

  if (step.action === "approval.create") {
    const db = supabaseAdmin();
    const { error } = await db.from("ai_approvals").insert({
      action: String(step.config.action ?? "workflow_action"),
      initiator_type: "workflow",
      initiator_id: workflow.id,
      agent_slug: step.agent_slug,
      risk_level: String(step.config.risk_level ?? "high"),
      context,
      proposed_result: step.config.proposed_result ?? {},
      expires_at: new Date(Date.now() + Number(step.config.ttl_minutes ?? 60) * 60_000).toISOString(),
      status: "pending",
    });
    return error ? { ok: false, error: "Impossible de créer l'approbation." } : { ok: false, error: "Validation humaine requise.", waitingApproval: true };
  }

  return { ok: false, error: `Action de workflow non supportée : ${step.action}` };
}

export async function runWorkflow(workflowId: string, context: Record<string, unknown> = {}) {
  const db = supabaseAdmin();
  const { data: workflow } = await db.from("ai_workflows").select("*").eq("id", workflowId).maybeSingle() as { data: WorkflowRow | null };
  if (!workflow) return { ok: false, error: "Workflow introuvable." };

  const { data: steps } = await db.from("ai_workflow_steps").select("step_key,step_order,action,agent_slug,tool_slug,policy_slug,required_approval,config").eq("workflow_id", workflowId).order("step_order");
  const ordered = (steps ?? []) as Array<{ action: string; agent_slug: string | null; tool_slug: string | null; policy_slug: string | null; required_approval: boolean; config: Record<string, unknown> }>;
  if (!ordered.length) return { ok: false, error: "Workflow sans étape." };

  const now = new Date().toISOString();
  const runId = await claimRun(db, workflow, now);
  if (!runId) return { ok: true, skipped: true, reason: "Exécution déjà revendiquée ou concurrence atteinte." };

  const results: Record<string, unknown>[] = [];
  try {
    for (const step of ordered) {
      const stepResult = await executeStep(workflow, step, { ...context, mode: context.mode ?? "SAFE" });
      results.push({ action: step.action, ...stepResult });
      if (!stepResult.ok) {
        await db.from("ai_workflow_runs").update({
          status: stepResult.waitingApproval ? "waiting_approval" : "failed",
          result: { steps: results },
          error: stepResult.error ?? null,
          finished_at: stepResult.waitingApproval ? null : new Date().toISOString(),
        }).eq("id", runId);
        if (!stepResult.waitingApproval) await db.from("ai_workflows").update({ last_run_at: now }).eq("id", workflow.id);
        return { ok: false, waitingApproval: Boolean(stepResult.waitingApproval), error: stepResult.error };
      }
    }

    await db.from("ai_workflow_runs").update({ status: "succeeded", result: { steps: results }, finished_at: new Date().toISOString(), error: null }).eq("id", runId);
    const next = intervalMs(workflow.definition);
    await db.from("ai_workflows").update({
      last_run_at: now,
      ...(next ? { next_run_at: new Date(Date.now() + next).toISOString() } : {}),
    }).eq("id", workflow.id);
    return { ok: true, runId, result: results };
  } catch (error) {
    await db.from("ai_workflow_runs").update({ status: "failed", result: { steps: results }, error: error instanceof Error ? error.message.slice(0, 1000) : "Erreur runtime", finished_at: new Date().toISOString() }).eq("id", runId);
    return { ok: false, error: "Erreur runtime du workflow." };
  }
}

export async function runDueWorkflows(limit = 5) {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const { data: workflows } = await db.from("ai_workflows").select("*").eq("status","active").eq("trigger_type","schedule").lte("next_run_at", now).order("next_run_at").limit(Math.min(Math.max(limit,1),20));
  const results = [];
  for (const workflow of (workflows ?? []) as WorkflowRow[]) {
    results.push({ workflowId: workflow.id, result: await runWorkflow(workflow.id, { mode: "SAFE", trigger: "schedule" }) });
  }
  return results;
}
