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

type StepRow = {
  step_key?: string;
  step_order: number;
  action: string;
  agent_slug: string | null;
  tool_slug: string | null;
  policy_slug: string | null;
  required_approval: boolean;
  config: Record<string, unknown>;
};

type RunRow = {
  id: string;
  workflow_id: string;
  status: string;
  attempt: number;
  current_step_order: number;
  context: Record<string, unknown>;
};

function intervalMs(definition: Record<string, unknown>): number {
  const minutes = Number(definition.interval_minutes ?? 0);
  if (!Number.isFinite(minutes) || minutes < 1) return 0;
  return Math.min(minutes, 24 * 60) * 60_000;
}

function isRetryable(action: string, error: string | undefined) {
  if (!error) return true;
  if (action === "tool.authorize") return false;
  if (/non trouvé|absent|interdit|non autorisé|policy|schéma|payload|prompt/i.test(error)) return false;
  return true;
}

function backoffMs(attempt: number) {
  const base = Math.min(2500, 250 * (2 ** Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(3000, base + jitter);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimRun(db: ReturnType<typeof supabaseAdmin>, workflow: WorkflowRow, now: string) {
  const { count: runningCount } = await db.from("ai_workflow_runs").select("id", { count: "exact", head: true }).eq("workflow_id", workflow.id).eq("status", "running");
  if ((runningCount ?? 0) >= Number(workflow.concurrency_limit ?? 1)) return null;
  const key = `${workflow.id}:${workflow.next_run_at ?? now}`;
  const { data: inserted, error: insertError } = await db.from("ai_workflow_runs").insert({
    workflow_id: workflow.id,
    idempotency_key: key,
    trigger_type: workflow.trigger_type,
    status: "queued",
    context: { source: "vercel-cron", scheduled_at: workflow.next_run_at ?? now, mode: "SAFE" },
    current_step_order: 1,
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

async function createApproval(
  db: ReturnType<typeof supabaseAdmin>,
  workflow: WorkflowRow,
  runId: string,
  step: StepRow,
  context: Record<string, unknown>,
  reason: string,
) {
  const { data: approval, error } = await db.from("ai_approvals").insert({
    action: String(step.config.action ?? `workflow:${workflow.slug}:${step.step_key ?? step.step_order}`),
    initiator_type: "workflow",
    initiator_id: workflow.id,
    workflow_id: workflow.id,
    agent_slug: step.agent_slug,
    risk_level: String(step.config.risk_level ?? (step.required_approval ? "high" : "medium")),
    context: { ...context, workflow_run_id: runId, workflow_step_order: step.step_order, approval_reason: reason },
    proposed_result: step.config.proposed_result ?? {},
    expires_at: new Date(Date.now() + Number(step.config.ttl_minutes ?? 60) * 60_000).toISOString(),
    status: "pending",
  }).select("id").single();

  if (error || !approval) return null;
  await db.from("ai_workflow_runs").update({ status: "waiting_approval", approval_id: approval.id, retry_at: null }).eq("id", runId).eq("status", "running");
  return String(approval.id);
}

async function executeStep(
  workflow: WorkflowRow,
  runId: string,
  step: StepRow,
  context: Record<string, unknown>,
): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string; waitingApproval?: boolean; approvalId?: string }> {
  if (step.required_approval && context.approved_step_order !== step.step_order) {
    const approvalId = await createApproval(supabaseAdmin(), workflow, runId, step, context, "Validation humaine requise avant cette étape.");
    if (!approvalId) return { ok: false, error: "Impossible de créer l'approbation du workflow." };
    return { ok: false, waitingApproval: true, approvalId, error: "Validation humaine requise." };
  }

  if (step.action === "noop") return { ok: true, result: { status: "noop" } };

  if (step.action === "agent.run") {
    const agent = step.agent_slug;
    if (agent !== "support" && agent !== "recherche" && agent !== "catalogue") {
      return { ok: false, error: "Cet agent n'est pas encore relié au runtime d'exécution." };
    }
    const prompt = typeof step.config.prompt === "string" ? step.config.prompt : typeof context.prompt === "string" ? context.prompt : "";
    if (!prompt.trim()) return { ok: false, error: "Prompt de workflow absent." };
    const result = await runAgent(agent, [{ role: "user", content: prompt }], {
      json: Boolean(step.config.json),
      workflowId: workflow.id,
      taskId: runId,
    });
    return result.ok
      ? { ok: true, result: { text: result.text, provider: result.provider, model: result.model, cost: result.estimatedCostUsd } }
      : { ok: false, error: result.error };
  }

  if (step.action === "tool.authorize") {
    if (!step.tool_slug) return { ok: false, error: "Outil de workflow absent." };
    const mode = typeof context.mode === "string" ? context.mode : "SAFE";
    const request = {
      agentSlug: step.agent_slug ?? "supervisor",
      toolSlug: step.tool_slug,
      actorId: typeof context.actor_id === "string" ? context.actor_id : undefined,
      riskLevel: step.required_approval ? "high" as const : "medium" as const,
      policySlug: step.policy_slug,
      input: context,
      mode: mode as "FULL" | "DEGRADED" | "SAFE" | "NO_AI" | "MAINTENANCE",
    };
    const decision = await authorizeToolCall(request);
    if ((decision.decision === "REQUIRE_APPROVAL") && context.approved_step_order === step.step_order) {
      return { ok: true, result: { decision: "ALLOW_AFTER_APPROVAL", policy: decision.policySlug } };
    }
    await recordToolDecision(request, decision, decision.decision === "ALLOW" ? "authorized" : undefined, decision.decision === "ALLOW" ? undefined : decision.reason);
    if (decision.decision === "REQUIRE_APPROVAL") {
      const approvalId = await createApproval(supabaseAdmin(), workflow, runId, step, context, decision.reason);
      return approvalId
        ? { ok: false, waitingApproval: true, approvalId, error: "Validation humaine requise." }
        : { ok: false, error: "Impossible de créer l'approbation du workflow." };
    }
    return decision.decision === "ALLOW"
      ? { ok: true, result: { decision: decision.decision, policy: decision.policySlug } }
      : { ok: false, error: decision.reason };
  }

  if (step.action === "approval.create") {
    if (context.approved_step_order === step.step_order) {
      return { ok: true, result: { decision: "approved" } };
    }
    const approvalId = await createApproval(supabaseAdmin(), workflow, runId, step, context, "Étape explicitement soumise à validation.");
    return approvalId
      ? { ok: false, waitingApproval: true, approvalId, error: "Validation humaine requise." }
      : { ok: false, error: "Impossible de créer l'approbation." };
  }

  return { ok: false, error: `Action de workflow non supportée : ${step.action}` };
}

async function executeWorkflowRun(
  db: ReturnType<typeof supabaseAdmin>,
  workflow: WorkflowRow,
  runId: string,
  initialContext: Record<string, unknown>,
  startStepOrder: number,
) {
  const { data: steps } = await db.from("ai_workflow_steps").select("step_key,step_order,action,agent_slug,tool_slug,policy_slug,required_approval,config").eq("workflow_id", workflow.id).order("step_order");
  const ordered = (steps ?? []) as StepRow[];
  if (!ordered.length) return { ok: false, error: "Workflow sans étape." };

  let context = { ...initialContext };
  const results: Record<string, unknown>[] = [];
  for (const step of ordered.filter((candidate) => candidate.step_order >= startStepOrder)) {
    let stepResult: Awaited<ReturnType<typeof executeStep>> = { ok: false, error: "Étape non exécutée." };
    let stepAttempts = 0;

    while (stepAttempts <= Number(workflow.max_retries ?? 2)) {
      stepAttempts++;
      stepResult = await executeStep(workflow, runId, step, context);
      if (stepResult.ok || stepResult.waitingApproval) break;
      if (!isRetryable(step.action, stepResult.error) || stepAttempts > Number(workflow.max_retries ?? 2)) break;
      await db.from("ai_workflow_runs").update({
        attempt: stepAttempts,
        retry_at: new Date(Date.now() + backoffMs(stepAttempts)).toISOString(),
      }).eq("id", runId);
      await sleep(backoffMs(stepAttempts));
    }

    results.push({ action: step.action, step_order: step.step_order, attempts: stepAttempts, ...stepResult });
    await db.from("ai_workflow_runs").update({
      current_step_order: step.step_order,
      last_step_result: stepResult.result ?? {},
      result: { steps: results },
      error: stepResult.error ?? null,
      retry_at: null,
    }).eq("id", runId);

    if (!stepResult.ok) {
      if (stepResult.waitingApproval) {
        return { ok: false, waitingApproval: true, approvalId: stepResult.approvalId, error: stepResult.error };
      }
      await db.from("ai_workflow_runs").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", runId);
      await db.from("ai_workflows").update({ last_run_at: new Date().toISOString() }).eq("id", workflow.id);
      return { ok: false, error: stepResult.error };
    }

    context = { ...context, last_step_result: stepResult.result ?? {} };
    await db.from("ai_workflow_runs").update({
      current_step_order: step.step_order + 1,
      last_step_result: stepResult.result ?? {},
    }).eq("id", runId);
  }

  await db.from("ai_workflow_runs").update({
    status: "succeeded",
    result: { steps: results },
    finished_at: new Date().toISOString(),
    error: null,
    retry_at: null,
    approval_id: null,
  }).eq("id", runId);

  const next = intervalMs(workflow.definition);
  const now = new Date().toISOString();
  await db.from("ai_workflows").update({
    last_run_at: now,
    ...(next ? { next_run_at: new Date(Date.now() + next).toISOString() } : {}),
  }).eq("id", workflow.id);

  return { ok: true, runId, result: results };
}

export async function runWorkflow(workflowId: string, context: Record<string, unknown> = {}) {
  const db = supabaseAdmin();
  const { data: workflow } = await db.from("ai_workflows").select("*").eq("id", workflowId).maybeSingle() as { data: WorkflowRow | null };
  if (!workflow) return { ok: false, error: "Workflow introuvable." };

  const now = new Date().toISOString();
  const runId = await claimRun(db, workflow, now);
  if (!runId) return { ok: true, skipped: true, reason: "Exécution déjà revendiquée ou concurrence atteinte." };
  await db.from("ai_workflow_runs").update({ context: { ...context, mode: context.mode ?? "SAFE" } }).eq("id", runId);
  return executeWorkflowRun(db, workflow, runId, { ...context, mode: context.mode ?? "SAFE" }, 1);
}

export async function resumeWorkflowRun(runId: string, approved = true) {
  const db = supabaseAdmin();
  const { data: run } = await db.from("ai_workflow_runs").select("id,workflow_id,status,attempt,current_step_order,context").eq("id", runId).maybeSingle() as { data: RunRow | null };
  if (!run || run.status !== "waiting_approval") return { ok: false, error: "Exécution en attente introuvable." };
  const { data: workflow } = await db.from("ai_workflows").select("*").eq("id", run.workflow_id).maybeSingle() as { data: WorkflowRow | null };
  if (!workflow) return { ok: false, error: "Workflow introuvable." };

  if (!approved) {
    await db.from("ai_workflow_runs").update({ status: "failed", error: "Validation humaine refusée.", finished_at: new Date().toISOString(), approval_id: null }).eq("id", runId).eq("status", "waiting_approval");
    return { ok: false, error: "Workflow refusé." };
  }

  const context = { ...(run.context ?? {}), approved_step_order: run.current_step_order, approval_granted_at: new Date().toISOString() };
  await db.from("ai_workflow_runs").update({ status: "running", approval_id: null, context }).eq("id", runId).eq("status", "waiting_approval");
  return executeWorkflowRun(db, workflow, runId, context, run.current_step_order);
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
