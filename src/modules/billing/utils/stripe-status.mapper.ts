import { SubscriptionStatus } from '../../../common/constants/enums';

export function mapStripeSubscriptionStatus(status: string | null | undefined): SubscriptionStatus {
    switch (status) {
        case 'active':
        case 'trialing':
            return SubscriptionStatus.ACTIVE;
        case 'past_due':
        case 'unpaid':
        case 'incomplete':
            return SubscriptionStatus.PAST_DUE;
        case 'canceled':
        case 'incomplete_expired':
        case 'paused':
            return SubscriptionStatus.SUSPENDED;
        default:
            return SubscriptionStatus.PAST_DUE;
    }
}
