export const RESERVATIONS_QUOTE_ENDPOINT_CODE = 'reservations.quote';

export const PREDEFINED_INTEGRATION_ENDPOINTS = [
    {
        code: RESERVATIONS_QUOTE_ENDPOINT_CODE,
        method: 'POST',
        path: '/api/v1/reservations/quote',
        version: 'v1',
        requiresApiKey: true,
        rateLimitPerMinute: 60,
        requestSchemaJson: {
            type: 'object',
            required: [
                'requestId',
                'hotelCode',
                'partnerCode',
                'reservationDate',
                'checkIn',
                'checkOut',
                'currency',
                'roomTypeCode',
                'boardCode',
                'adults',
            ],
            additionalProperties: false,
            properties: {
                requestId: { type: 'string', maxLength: 100 },
                hotelCode: { type: 'string', maxLength: 100 },
                partnerCode: { type: 'string', maxLength: 100 },
                reservationDate: { type: 'string', format: 'date' },
                checkIn: { type: 'string', format: 'date' },
                checkOut: { type: 'string', format: 'date' },
                currency: { type: 'string', minLength: 3, maxLength: 3 },
                roomTypeCode: { type: 'string', maxLength: 100 },
                boardCode: { type: 'string', maxLength: 100 },
                adults: { type: 'integer', minimum: 1 },
                childrenAges: {
                    type: 'array',
                    items: { type: 'integer', minimum: 0 },
                },
            },
        },
        responseSchemaJson: {
            oneOf: [
                {
                    type: 'object',
                    required: ['requestId', 'status', 'hotelCode', 'partnerCode', 'contract', 'stay', 'pricing', 'warnings'],
                    additionalProperties: false,
                    properties: {
                        requestId: { type: 'string' },
                        status: { const: 'QUOTED' },
                        hotelCode: { type: 'string' },
                        partnerCode: { type: 'string' },
                        contract: { type: 'string' },
                        stay: {
                            type: 'object',
                            required: ['checkIn', 'checkOut', 'nights'],
                            additionalProperties: false,
                            properties: {
                                checkIn: { type: 'string', format: 'date' },
                                checkOut: { type: 'string', format: 'date' },
                                nights: { type: 'integer', minimum: 1 },
                            },
                        },
                        pricing: {
                            type: 'object',
                            required: [
                                'currency',
                                'nightlyLineMode',
                                'nightlyLineModeLabel',
                                'nightlyRates',
                                'discounts',
                                'reductions',
                                'supplements',
                                'taxes',
                                'totalBeforeDiscount',
                                'discountAmount',
                                'totalBeforeTax',
                                'taxAmount',
                                'grandTotal',
                            ],
                            additionalProperties: false,
                            properties: {
                                currency: { type: 'string', minLength: 3, maxLength: 3 },
                                nightlyLineMode: { type: 'string' },
                                nightlyLineModeLabel: { type: 'string' },
                                nightlyRates: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        required: ['date', 'roomTypeCode', 'boardCode', 'baseRate', 'occupancy', 'discountAmount', 'supplementsAmount', 'totalBeforeTax'],
                                        additionalProperties: false,
                                        properties: {
                                            date: { type: 'string', format: 'date' },
                                            roomTypeCode: { type: 'string' },
                                            boardCode: { type: 'string' },
                                            baseRate: { type: 'number' },
                                            occupancy: {
                                                type: 'object',
                                                required: ['adults', 'children', 'total', 'amount', 'pricingBasisParts'],
                                                additionalProperties: false,
                                                properties: {
                                                    adults: { type: 'integer' },
                                                    children: { type: 'integer' },
                                                    total: { type: 'integer' },
                                                    amount: { type: 'number' },
                                                    pricingBasisParts: {
                                                        type: 'array',
                                                        items: {
                                                            type: 'object',
                                                            required: ['type', 'label', 'unitAmount', 'quantity', 'amount'],
                                                            additionalProperties: false,
                                                            properties: {
                                                                type: { type: 'string' },
                                                                label: { type: 'string' },
                                                                unitAmount: { type: 'number' },
                                                                quantity: { type: 'number' },
                                                                amount: { type: 'number' },
                                                                percentageOfBase: { type: ['number', 'null'] },
                                                                reductionPercentage: { type: ['number', 'null'] },
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                            discountAmount: { type: 'number' },
                                            supplementsAmount: { type: 'number' },
                                            totalBeforeTax: { type: 'number' },
                                        },
                                    },
                                },
                                discounts: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        required: ['name', 'amount'],
                                        additionalProperties: false,
                                        properties: {
                                            name: { type: 'string' },
                                            amount: { type: 'number' },
                                        },
                                    },
                                },
                                reductions: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        required: ['name', 'amount'],
                                        additionalProperties: false,
                                        properties: {
                                            name: { type: 'string' },
                                            amount: { type: 'number' },
                                        },
                                    },
                                },
                                supplements: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        required: ['name', 'amount'],
                                        additionalProperties: false,
                                        properties: {
                                            name: { type: 'string' },
                                            amount: { type: 'number' },
                                        },
                                    },
                                },
                                taxes: {
                                    type: 'array',
                                    items: { type: 'object' },
                                },
                                totalBeforeDiscount: { type: 'number' },
                                discountAmount: { type: 'number' },
                                totalBeforeTax: { type: 'number' },
                                taxAmount: { type: 'number' },
                                grandTotal: { type: 'number' },
                            },
                        },
                        warnings: { type: 'array', items: { type: 'string' } },
                    },
                },
                {
                    type: 'object',
                    required: ['requestId', 'status', 'errorCode', 'error', 'message'],
                    additionalProperties: false,
                    properties: {
                        requestId: { type: ['string', 'null'] },
                        status: { const: 'FAILED' },
                        errorCode: { type: 'string' },
                        message: { type: 'string' },
                        error: {
                            type: 'object',
                            required: ['code', 'message'],
                            properties: {
                                code: { type: 'string' },
                                message: { type: 'string' },
                            },
                        },
                    },
                },
            ],
        },
    },
] as const;
