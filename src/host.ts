/** Where the app is hosted (Power Apps player, Microsoft Teams tab, or a local preview). */
export const host: { teams: boolean; theme?: 'light' | 'dark' } = { teams: false };

/**
 * Reads host query parameters. The Teams tab URL passes ppmhost=teams and Teams' theme
 * (default | dark | contrast) so the app can match the Teams client.
 */
export function readHost(params: Record<string, string | undefined>) {
  const p = Object.fromEntries(Object.entries(params).map(([k, v]) => [k.toLowerCase(), v ?? '']));
  host.teams = p.ppmhost === 'teams' || (p.source || '').toLowerCase().startsWith('teams');
  if (p.theme) host.theme = p.theme === 'default' || p.theme === 'light' ? 'light' : 'dark';
}
