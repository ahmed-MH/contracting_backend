import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HotelAccessGuard } from './common/guards/hotel-access.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { HotelModule } from './modules/hotel/hotel.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { UsersModule } from './modules/users/users.module';
import { AffiliateModule } from './modules/affiliate/affiliate.module';
import { ContractModule } from './modules/contract/contract.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { SimulationModule } from './modules/simulation/simulation.module';
import { AuthModule } from './modules/auth/auth.module';
import { MailModule } from './modules/mail/mail.module';
import { CustomIdSubscriber } from './common/subscribers/custom-id.subscriber';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mssql',
        host: configService.get<string>('DB_HOST'),
        port: parseInt(configService.get<string>('DB_PORT') || '1433', 10),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        autoLoadEntities: true,
        synchronize: configService.get<string>('DB_SYNCHRONIZE') === 'true',
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      }),
    }),

    // Feature modules
    HotelModule,
    CatalogModule,
    AffiliateModule,
    UsersModule,
    ContractModule,
    PricingModule,
    SimulationModule,

    // Auth & Mail
    AuthModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [
    // Global JWT guard: all routes require auth unless @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global Hotel Access Guard: validates x-hotel-id against user.hotelIds if present
    {
      provide: APP_GUARD,
      useClass: HotelAccessGuard,
    },
    // Global Roles Guard: ZERO TRUST — denies if no @Roles() defined
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    CustomIdSubscriber,
  ],
})
export class AppModule { }