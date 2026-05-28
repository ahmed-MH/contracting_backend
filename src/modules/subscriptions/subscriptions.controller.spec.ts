import 'reflect-metadata';
import { ALLOW_SUSPENDED_TENANT_KEY } from '../../common/decorators/allow-suspended-tenant.decorator';
import { SubscriptionsController } from './subscriptions.controller';

describe('SubscriptionsController', () => {
    it('allows suspended tenant admins to start billing checkout recovery', () => {
        const metadata = Reflect.getMetadata(
            ALLOW_SUSPENDED_TENANT_KEY,
            SubscriptionsController.prototype.createTenantCheckoutSession,
        );

        expect(metadata).toBe(true);
    });

    it('allows suspended tenant admins to sync checkout recovery status', () => {
        const metadata = Reflect.getMetadata(
            ALLOW_SUSPENDED_TENANT_KEY,
            SubscriptionsController.prototype.syncCheckout,
        );

        expect(metadata).toBe(true);
    });
});
