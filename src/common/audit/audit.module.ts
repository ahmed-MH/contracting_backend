import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { AuditService } from './audit.service';
import { SystemLog } from './system-log.entity';
import { SystemLogsController } from './system-logs.controller';

@Global()
@Module({
    imports: [TypeOrmModule.forFeature([User, SystemLog])],
    controllers: [SystemLogsController],
    providers: [AuditService],
    exports: [AuditService],
})
export class AuditModule { }
