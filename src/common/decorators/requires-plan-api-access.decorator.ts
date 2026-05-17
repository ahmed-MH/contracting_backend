import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PLAN_API_ACCESS_KEY = 'requiresPlanApiAccess';

export const RequiresPlanApiAccess = () => SetMetadata(REQUIRES_PLAN_API_ACCESS_KEY, true);
