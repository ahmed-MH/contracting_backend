import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateSubscriptionStatusDto } from './dto/update-subscription-status.dto';

export interface SubscriptionRecord {
    id: number;
    organizationName: string;
    planId: number;
    planName: string;
    monthlyRecurringRevenue: number;
    currency: string;
    status: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';
    renewalDate: string;
    hotelUsage: number;
    userUsage: number;
    note?: string;
}

@Injectable()
export class SubscriptionsService {
    private readonly subscriptions: SubscriptionRecord[] = [
        {
            id: 1,
            organizationName: 'Atlas Hospitality',
            planId: 3,
            planName: 'Enterprise',
            monthlyRecurringRevenue: 18400,
            currency: 'USD',
            status: 'ACTIVE',
            renewalDate: '2026-05-01',
            hotelUsage: 18,
            userUsage: 46,
        },
        {
            id: 2,
            organizationName: 'Blue Dune Collection',
            planId: 2,
            planName: 'Pro',
            monthlyRecurringRevenue: 6900,
            currency: 'USD',
            status: 'PAST_DUE',
            renewalDate: '2026-04-14',
            hotelUsage: 9,
            userUsage: 21,
            note: 'Invoice retry in progress.',
        },
        {
            id: 3,
            organizationName: 'Vista Resort Group',
            planId: 3,
            planName: 'Enterprise',
            monthlyRecurringRevenue: 23700,
            currency: 'USD',
            status: 'ACTIVE',
            renewalDate: '2026-05-09',
            hotelUsage: 24,
            userUsage: 58,
        },
        {
            id: 4,
            organizationName: 'Sunline Leisure',
            planId: 2,
            planName: 'Pro',
            monthlyRecurringRevenue: 8250,
            currency: 'USD',
            status: 'PAST_DUE',
            renewalDate: '2026-04-19',
            hotelUsage: 11,
            userUsage: 27,
            note: 'Trial converting to paid tier.',
        },
    ];

    findAll(): SubscriptionRecord[] {
        return this.subscriptions;
    }

    getSummary() {
        const activeMrr = this.subscriptions
            .filter((subscription) => subscription.status === 'ACTIVE')
            .reduce((total, subscription) => total + subscription.monthlyRecurringRevenue, 0);

        const atRiskMrr = this.subscriptions
            .filter((subscription) => subscription.status !== 'ACTIVE')
            .reduce((total, subscription) => total + subscription.monthlyRecurringRevenue, 0);

        return {
            totalSubscriptions: this.subscriptions.length,
            activeSubscriptions: this.subscriptions.filter((subscription) => subscription.status === 'ACTIVE').length,
            pastDueSubscriptions: this.subscriptions.filter((subscription) => subscription.status === 'PAST_DUE').length,
            suspendedSubscriptions: this.subscriptions.filter((subscription) => subscription.status === 'SUSPENDED').length,
            monthlyRecurringRevenue: activeMrr,
            atRiskMonthlyRecurringRevenue: atRiskMrr,
            currency: 'USD',
        };
    }

    updateStatus(id: number, dto: UpdateSubscriptionStatusDto): SubscriptionRecord {
        const subscription = this.subscriptions.find((item) => item.id === id);
        if (!subscription) {
            throw new NotFoundException(`Subscription #${id} not found`);
        }

        subscription.status = dto.status;
        if (dto.renewalDate) {
            subscription.renewalDate = dto.renewalDate;
        }
        subscription.note = dto.reason ?? subscription.note;

        return subscription;
    }
}
