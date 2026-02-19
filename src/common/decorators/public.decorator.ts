import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as publicly accessible — bypasses JWT authentication.
 * All routes require a valid JWT by default (APP_GUARD).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
