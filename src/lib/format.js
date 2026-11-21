// Small display helpers shared by the UI Kit frontends. Pure functions, unit-tested.

export const MAX_TEAMS = 3;

/**
 * One line for the "Who to escalate to" box: "Implementer: X · Teams: A, B, C and 7 more".
 * `owner` is the result of service.changeContext().
 */
export function escalationText(owner, maxTeams = MAX_TEAMS) {
  const teams = owner?.teamworkGraph?.ownerTeams || [];
  const who = owner?.implementer ? `Implementer: ${owner.implementer}` : '';
  if (!teams.length) return who || 'No owner or team found for this change.';
  const shown = teams.slice(0, maxTeams).join(', ');
  const more = teams.length > maxTeams ? ` and ${teams.length - maxTeams} more` : '';
  return `${who ? `${who} · ` : ''}Teams: ${shown}${more}`;
}
