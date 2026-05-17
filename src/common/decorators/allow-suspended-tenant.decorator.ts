import { SetMetadata } from '@nestjs/common';

export const ALLOW_SUSPENDED_TENANT_KEY = 'allowSuspendedTenant';

/**
 * Allows suspended tenant users to reach safe account/status endpoints.
 * Operational and tenant-management routes must not use this decorator.
 */
export const AllowSuspendedTenant = () => SetMetadata(ALLOW_SUSPENDED_TENANT_KEY, true);
