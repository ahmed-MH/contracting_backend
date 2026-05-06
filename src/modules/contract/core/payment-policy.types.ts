import { ContractMarketScope, PaymentConditionType, PaymentMethodType } from '../../../common/constants/enums';
import { PaymentConditionBasis, PaymentDepositType, PaymentDueTrigger } from './dto/payment-policy.dto';

export interface ContractPaymentMethodPolicy {
    type: PaymentMethodType;
    isPrimary?: boolean;
}

export interface ContractPaymentConditionPolicy {
    type: PaymentConditionType;
    percentage?: number;
    days?: number;
    basis?: PaymentConditionBasis;
    label?: string;
    notes?: string;
}

export interface ContractPaymentDepositPolicy {
    type: PaymentDepositType;
    value: number;
    currency?: string;
    dueTrigger?: PaymentDueTrigger;
    dueDays?: number;
    refundable?: boolean;
}

export interface ContractPaymentPolicy {
    marketScope: ContractMarketScope;
    methods: ContractPaymentMethodPolicy[];
    conditions: ContractPaymentConditionPolicy[];
    deposit?: ContractPaymentDepositPolicy | null;
    selectedHotelBankAccountId?: number | null;
    notes?: string | null;
}
