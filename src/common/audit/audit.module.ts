import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { AuditService } from './audit.service';

@Global()
@Module({
    imports: [TypeOrmModule.forFeature([User])],
    providers: [AuditService],
    exports: [AuditService],
})
export class AuditModule { }
