import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Affiliate } from '../affiliate/entities/affiliate.entity';
import { Contract } from '../contract/core/entities/contract.entity';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { Arrangement } from '../hotel/entities/arrangement.entity';
import { Hotel } from '../hotel/entities/hotel.entity';
import { RoomType } from '../hotel/entities/room-type.entity';
import { SimulationModule } from '../simulation/simulation.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PlanEntitlementsGuard } from '../../common/guards/plan-entitlements.guard';
import { IntegrationApiKeysController } from './integration-api-keys.controller';
import { IntegrationApiKeysService } from './integration-api-keys.service';
import { IntegrationApiUsageLogsService } from './integration-api-usage-logs.service';
import { IntegrationApiUsersController } from './integration-api-users.controller';
import { IntegrationApiUsersService } from './integration-api-users.service';
import { IntegrationEndpointsController } from './integration-endpoints.controller';
import { IntegrationEndpointsService } from './integration-endpoints.service';
import { IntegrationOverviewController } from './integration-overview.controller';
import { IntegrationOverviewService } from './integration-overview.service';
import { IntegrationPlaygroundController } from './integration-playground.controller';
import { IntegrationPublicController } from './integration-public.controller';
import { IntegrationQuoteService } from './integration-quote.service';
import { IntegrationUsageLogsController } from './integration-usage-logs.controller';
import { IntegrationApiKey } from './entities/integration-api-key.entity';
import { IntegrationApiUsageLog } from './entities/integration-api-usage-log.entity';
import { IntegrationApiUser } from './entities/integration-api-user.entity';
import { IntegrationEndpoint } from './entities/integration-endpoint.entity';

@Module({
    imports: [
        ExchangeRatesModule,
        SimulationModule,
        SubscriptionsModule,
        TypeOrmModule.forFeature([
            Hotel,
            Affiliate,
            RoomType,
            Arrangement,
            Contract,
            ContractLine,
            IntegrationApiUser,
            IntegrationApiKey,
            IntegrationEndpoint,
            IntegrationApiUsageLog,
        ]),
    ],
    controllers: [
        IntegrationPublicController,
        IntegrationPlaygroundController,
        IntegrationApiUsersController,
        IntegrationApiKeysController,
        IntegrationEndpointsController,
        IntegrationUsageLogsController,
        IntegrationOverviewController,
    ],
    providers: [
        IntegrationApiUsersService,
        IntegrationApiKeysService,
        IntegrationEndpointsService,
        IntegrationApiUsageLogsService,
        IntegrationOverviewService,
        IntegrationQuoteService,
        PlanEntitlementsGuard,
    ],
})
export class IntegrationsModule { }
