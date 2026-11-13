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

