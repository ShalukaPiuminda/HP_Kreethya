export type PermissionAction =
  | 'can_read'
  | 'can_create'
  | 'can_update'
  | 'can_delete';

export interface Permission {
  id: number;
  role_id: number;
  module: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}

/** Paid add-on features, enabled per installation by the developer account. */
export type FeatureKey = 'sms';

export type FeatureMap = Partial<Record<FeatureKey, boolean>>;

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role_id: number;
  BC: string;
  /** Hidden vendor account that switches paid features on and off. */
  is_developer?: boolean;
  role: {
    id: number;
    name: string;
    description: string;
    permissions?: Permission[];
  };
}
