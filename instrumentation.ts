/** Journalisation structurée des erreurs serveur (Next.js 15). Remplaçable par Sentry : voir README, section « Surveillance ». Aucune donnée personnelle n'est journalisée. */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routerKind: string; routePath: string; routeType: string }) {
  const e = err as { message?: string; digest?: string };
  console.error(JSON.stringify({ level: "error", at: new Date().toISOString(), method: request.method, path: request.path, route: context.routePath, type: context.routeType, digest: e.digest, message: e.message }));
}
