export const accountRoles = ['personal', 'gym_owner'] as const;
export type AccountRole = (typeof accountRoles)[number];

export function isAccountRole(value: unknown): value is AccountRole {
  return value === 'personal' || value === 'gym_owner';
}

export const accountRoleLabel = (role: AccountRole) => role === 'gym_owner' ? 'Gym owner account' : 'Personal account';
