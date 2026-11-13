import { supabaseAdmin } from "@/lib/supabase/server";

export type PolicyEvaluation = {
  allowed: boolean;
  decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "REQUIRE_STEP_UP_AUTH";
  reason: string;
  policySlug: string;
  policyVersion: number | null;
};

type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueMatchesType(value: unknown, type: unknown): boolean {
  if (typeof type !== "string") return true;
  if (type === "object") return isRecord(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "number" || type === "integer") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}

export function validateToolInput(schema: unknown, input: Record<string, unknown>): string | null {
  if (!isRecord(schema) || Object.keys(schema).length === 0) return null;

  if (schema.type && !valueMatchesType(input, schema.type)) {
    return "Entrée d'outil incompatible avec le schéma.";
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  for (const key of required) {
    if (!(key in input)) return `Champ requis absent : ${key}.`;
  }

  const maxProperties = Number(schema.maxProperties);
  if (Number.isFinite(maxProperties) && Object.keys(input).length > maxProperties) {
    return "Trop de paramètres pour cet outil.";
  }

  const additionalProperties = schema.additionalProperties;
  if (additionalProperties === false) {
    for (const key of Object.keys(input)) {
      if (!(key in properties)) return `Paramètre non autorisé : ${key}.`;
    }
  }

  for (const [key, rule] of Object.entries(properties)) {
    if (!(key in input) || !isRecord(rule)) continue;
    const value = input[key];
    if (!valueMatchesType(value, rule.type)) return `Type invalide pour ${key}.`;
    if (typeof value === "string") {
      const maxLength = Number(rule.maxLength);
      if (Number.isFinite(maxLength) && value.length > maxLength) return `Valeur trop longue pour ${key}.`;
    }
    if (Array.isArray(rule.enum) && !rule.enum.some((candidate) => Object.is(candidate, value))) {
      return `Valeur interdite pour ${key}.`;
    }
  }

  return null;
}

function containsSecretLikeValue(value: unknown): boolean {
  if (typeof value === "string") {
    return /(bearer\s+|sk-[A-Za-z0-9]|gsk_[A-Za-z0-9]|api[_-]?key\s*[:=]|password\s*[:=])/i.test(value);
  }
  if (Array.isArray(value)) return value.some(containsSecretLikeValue);
  if (isRecord(value)) return Object.entries(value).some(([key, child]) => /secret|token|password|api[_-]?key|credential/i.test(key) || containsSecretLikeValue(child));
  return false;
}

export async function evaluateAiPolicy(input: {
  policySlug?: string | null;
  agentSlug: string;
  toolSlug: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  mode: "FULL" | "DEGRADED" | "SAFE" | "NO_AI" | "MAINTENANCE";
  payload: Record<string, unknown>;
}): Promise<PolicyEvaluation> {
  const policySlug = input.policySlug?.trim() || "default_agent_safety";
  const db = supabaseAdmin();
  const { data: policy, error } = await db
    .from("ai_policies")
    .select("slug,version,enabled,rules")
    .eq("slug", policySlug)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !policy || !policy.enabled) {
    return { allowed: false, decision: "DENY", reason: "Policy IA absente ou désactivée.", policySlug, policyVersion: null };
  }

  const rules = isRecord(policy.rules) ? policy.rules : {};

  if (input.mode === "NO_AI" || input.mode === "MAINTENANCE") {
    return { allowed: false, decision: "DENY", reason: `Mode ${input.mode} interdit l'exécution IA.`, policySlug, policyVersion: Number(policy.version) };
  }

  if (rules.no_secret_plaintext !== false && containsSecretLikeValue(input.payload)) {
    return { allowed: false, decision: "DENY", reason: "Le payload contient une donnée sensible interdite.", policySlug, policyVersion: Number(policy.version) };
  }

  if (rules.external_content_untrusted === true && Boolean(input.payload.__grant_permission)) {
    return { allowed: false, decision: "DENY", reason: "Un contenu externe ne peut pas accorder de permission.", policySlug, policyVersion: Number(policy.version) };
  }

  if (rules.no_sql_global === true && /(sql|database|query|shell|admin)/i.test(input.toolSlug) && input.riskLevel !== "low") {
    return { allowed: false, decision: "DENY", reason: "L'accès système global est interdit aux outils IA.", policySlug, policyVersion: Number(policy.version) };
  }

  if (input.mode === "SAFE" && input.riskLevel === "critical") {
    return { allowed: false, decision: "REQUIRE_APPROVAL", reason: "Le mode SAFE exige un contrôle humain pour une action critique.", policySlug, policyVersion: Number(policy.version) };
  }

  if (rules.double_validation === true && input.riskLevel === "critical") {
    return { allowed: false, decision: "REQUIRE_STEP_UP_AUTH", reason: "Double validation requise par la policy.", policySlug, policyVersion: Number(policy.version) };
  }

  if (rules.step_up_auth === true && input.riskLevel === "critical") {
    return { allowed: false, decision: "REQUIRE_STEP_UP_AUTH", reason: "Step-up authentication requise par la policy.", policySlug, policyVersion: Number(policy.version) };
  }

  if (rules.default_decision === "DENY" && input.riskLevel === "critical") {
    return { allowed: false, decision: "REQUIRE_APPROVAL", reason: "Action critique soumise à validation humaine.", policySlug, policyVersion: Number(policy.version) };
  }

  return { allowed: true, decision: "ALLOW", reason: "Policy validée.", policySlug, policyVersion: Number(policy.version) };
}
