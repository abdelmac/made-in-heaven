const workspaceParameters = ['view', 'invite', 'auth-error', 'reset-password', 'checkout'];

/** Keep existing workspace links working while ordinary visits show the public home page. */
export function opensWorkspace(search: string): boolean {
  const parameters = new URLSearchParams(search);
  return workspaceParameters.some((parameter) => parameters.has(parameter));
}
