import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_PLAN_API_ACCESS_KEY } from '../decorators/requires-plan-api-access.decorator';
import { AuthenticatedRequest } from '../interfaces/request.interface';
import { TenantUsageService } from '../../modules/subscriptions/tenant-usage.service';

@Injectable()
export class PlanEntitlementsGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly tenantUsageService: TenantUsageService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiresApiAccess = this.reflector.getAllAndOverride<boolean>(REQUIRES_PLAN_API_ACCESS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiresApiAccess) {
            return true;
        }

        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const tenantId = request.user?.tenantId;

        if (!tenantId) {
            throw new ForbiddenException('No active plan is assigned to this tenant.');
        }

        await this.tenantUsageService.assertCanUseApiAccess(tenantId);
        return true;
    }
}
