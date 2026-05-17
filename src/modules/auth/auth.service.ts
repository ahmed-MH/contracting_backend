import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
    OnModuleInit,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { UserRole } from '../../common/constants/enums';
import { LoginDto } from './dto/login.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TenantUsageService } from '../subscriptions/tenant-usage.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuditLogCategory, AuditLogSeverity } from '../../common/audit/audit.types';
import { RequestUser } from '../../common/interfaces/request.interface';

const SALT_ROUNDS = 10;
const INVALID_INVITE_MESSAGE = 'This invitation is no longer valid. Please contact your organization administrator.';

@Injectable()
export class AuthService implements OnModuleInit {
    private readonly logger = new Logger(AuthService.name);

    /* istanbul ignore next */
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly mailService: MailService,
        private readonly tenantUsageService: TenantUsageService,
        private readonly auditService: AuditService,
    ) { }

    // â”€â”€â”€ Seed Admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async onModuleInit(): Promise<void> {
        const existing = await this.usersService.findAdmin();
        if (existing) {
            this.logger.log(`Supervisor already exists: ${existing.email}`);
            return;
        }

        const hashedPassword = await bcrypt.hash('admin123', SALT_ROUNDS);
        const admin = await this.usersService.createSeedAdmin({
            email: 'admin@marriott.com',
            firstName: 'Super',
            lastName: 'Admin',
            password: hashedPassword,
            role: UserRole.SUPERVISOR,
        });

        this.logger.log(`ðŸ”‘ Seed supervisor created: ${admin.email} / admin123`);
    }

    // â”€â”€â”€ Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async login(dto: LoginDto) {
        const user = await this.usersService.findByEmail(dto.email);
        if (!user || !user.password) {
            await this.auditService.logAuth({
                eventType: 'LOGIN_FAILED',
                severity: AuditLogSeverity.WARNING,
                message: `Login failed for ${dto.email}`,
                actorEmail: dto.email,
                metadata: { reason: 'invalid_credentials' },
            });
            throw new UnauthorizedException('Invalid credentials');
        }

        const passwordValid = await bcrypt.compare(dto.password, user.password);
        if (!passwordValid) {
            await this.auditService.logAuth({
                eventType: 'LOGIN_FAILED',
                severity: AuditLogSeverity.WARNING,
                message: `Login failed for ${dto.email}`,
                actorUserId: user.id,
                actorEmail: user.email,
                actorRole: user.role,
                tenantId: user.tenantId ?? null,
                metadata: { reason: 'invalid_credentials' },
            });
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!user.isActive && user.invitationToken) {
            await this.auditService.logAuth({
                eventType: 'LOGIN_FAILED',
                severity: AuditLogSeverity.WARNING,
                message: `Inactive invited account ${user.email} attempted to login`,
                actorUserId: user.id,
                actorEmail: user.email,
                actorRole: user.role,
                tenantId: user.tenantId ?? null,
                metadata: { reason: 'pending_invite' },
            });
            throw new UnauthorizedException('Account is not activated. Check your invitation email.');
        }

        if (!user.isActive) {
            await this.auditService.logAuth({
                eventType: 'LOGIN_FAILED',
                severity: AuditLogSeverity.WARNING,
                message: `Suspended account ${user.email} attempted to login`,
                actorUserId: user.id,
                actorEmail: user.email,
                actorRole: user.role,
                tenantId: user.tenantId ?? null,
                metadata: { reason: 'suspended_account' },
            });
            throw new UnauthorizedException('Account is suspended. Contact your administrator.');
        }

        const payload = {
            sub: user.id,
            email: user.email,
            firstName: user.firstName ?? null,
            lastName: user.lastName ?? null,
            displayName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || null,
            role: user.role,
            hotelIds: user.hotels?.map(h => h.id) || [],
            tenantId: user.tenantId || null
        };
        await this.auditService.logAuth({
            eventType: 'LOGIN_SUCCESS',
            message: `User ${user.email} logged in`,
            actorUserId: user.id,
            actorEmail: user.email,
            actorRole: user.role,
            tenantId: user.tenantId ?? null,
        });

        return {
            accessToken: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                tenantId: user.tenantId || null,
                hotelIds: user.hotels?.map(h => h.id) || [],
            },
        };
    }

    // â”€â”€â”€ Invite â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async invite(dto: InviteUserDto, currentUser: RequestUser) {
        if (!currentUser.tenantId) {
            throw new BadRequestException('No active tenant is associated with this user.');
        }

        if ((dto.role as UserRole) === UserRole.SUPERVISOR) {
            throw new BadRequestException('This role cannot be invited to a tenant.');
        }

        // ADMIN = global, no hotel required. COMMERCIAL/AGENT = must have at least one hotel.
        if (dto.role === UserRole.COMMERCIAL || dto.role === UserRole.AGENT) {
            if (!dto.hotelIds || dto.hotelIds.length === 0) {
                throw new BadRequestException('This role must be assigned to at least one hotel.');
            }
        }

        await this.tenantUsageService.assertCanInviteUser(currentUser.tenantId);

        const token = randomUUID();

        const user = await this.usersService.createInvitedUser({
            email: dto.email,
            role: dto.role,
            invitationToken: token,
            tenantId: currentUser.tenantId,
        });

        // Assign hotels only for hotel-scoped users
        if (dto.role !== UserRole.ADMIN && dto.hotelIds && dto.hotelIds.length > 0) {
            await this.usersService.update(user.id, { hotelIds: dto.hotelIds });
        }

        this.mailService.sendUserInvitation(dto.email, token);
        await this.auditService.log({
            eventType: 'USER_INVITED',
            category: AuditLogCategory.INVITE,
            message: `User ${dto.email} was invited as ${dto.role}`,
            actor: await this.auditService.resolveActor(currentUser),
            tenantId: currentUser.tenantId,
            targetType: 'user',
            targetId: user.id,
            metadata: { invitedEmail: dto.email, invitedRole: dto.role, hotelIds: dto.hotelIds ?? [] },
        });

        return { message: `Invitation sent to ${dto.email}` };
    }

    // â”€â”€â”€ Accept Invite â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async acceptInvite(dto: AcceptInviteDto) {
        const user = await this.usersService.findByInvitationToken(dto.token);
        if (!user || user.invitationCanceledAt || !user.invitationToken) {
            throw new BadRequestException(INVALID_INVITE_MESSAGE);
        }

        user.firstName = dto.firstName;
        user.lastName = dto.lastName;
        user.password = await bcrypt.hash(dto.password, SALT_ROUNDS);
        user.isActive = true;
        user.invitationToken = null as unknown as string;

        await this.usersService.save(user);
        await this.auditService.log({
            eventType: 'INVITE_ACCEPTED',
            category: AuditLogCategory.INVITE,
            message: `Invitation was accepted by ${user.email}`,
            actorUserId: user.id,
            actorEmail: user.email,
            actorRole: user.role,
            tenantId: user.tenantId ?? null,
            targetType: 'user',
            targetId: user.id,
        });

        const payload = {
            sub: user.id,
            email: user.email,
            firstName: user.firstName ?? null,
            lastName: user.lastName ?? null,
            displayName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || null,
            role: user.role,
            hotelIds: user.hotels?.map(h => h.id) || [],
            tenantId: user.tenantId || null
        };
        return {
            accessToken: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                tenantId: user.tenantId || null,
                hotelIds: user.hotels?.map(h => h.id) || [],
            },
        };
    }

    async validateInviteToken(token?: string) {
        if (!token) {
            throw new BadRequestException(INVALID_INVITE_MESSAGE);
        }

        const user = await this.usersService.findByInvitationToken(token);
        if (!user || user.invitationCanceledAt || !user.invitationToken) {
            throw new BadRequestException(INVALID_INVITE_MESSAGE);
        }

        return { valid: true };
    }

    // â”€â”€â”€ Forgot Password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async forgotPassword(dto: ForgotPasswordDto) {
        const user = await this.usersService.findByEmail(dto.email);

        // Always return success to avoid email enumeration
        if (!user || !user.isActive) {
            return { message: 'If the email exists, a reset link has been sent.' };
        }

        const token = randomUUID();
        user.resetPasswordToken = token;
        await this.usersService.save(user);

        this.mailService.sendPasswordReset(dto.email, token);

        return { message: 'If the email exists, a reset link has been sent.' };
    }

    // â”€â”€â”€ Reset Password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async resetPassword(dto: ResetPasswordDto) {
        const user = await this.usersService.findByResetToken(dto.token);
        if (!user) {
            throw new BadRequestException('Invalid or expired reset token');
        }

        user.password = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
        user.resetPasswordToken = null as unknown as string;
        await this.usersService.save(user);
        await this.auditService.logAuth({
            eventType: 'PASSWORD_RESET',
            message: `Password was reset for ${user.email}`,
            actorUserId: user.id,
            actorEmail: user.email,
            actorRole: user.role,
            tenantId: user.tenantId ?? null,
        });

        return { message: 'Password has been reset successfully.' };
    }
}
