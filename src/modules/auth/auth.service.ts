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

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService implements OnModuleInit {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly mailService: MailService,
    ) { }

    // ─── Seed Admin ──────────────────────────────────────────────────
    async onModuleInit(): Promise<void> {
        const existing = await this.usersService.findAdmin();
        if (existing) {
            this.logger.log(`Admin already exists: ${existing.email}`);
            return;
        }

        const hashedPassword = await bcrypt.hash('admin123', SALT_ROUNDS);
        const admin = await this.usersService.createSeedAdmin({
            email: 'admin@marriott.com',
            firstName: 'Super',
            lastName: 'Admin',
            password: hashedPassword,
            role: UserRole.ADMIN,
        });

        this.logger.log(`🔑 Seed admin created: ${admin.email} / admin123`);
    }

    // ─── Login ───────────────────────────────────────────────────────
    async login(dto: LoginDto) {
        const user = await this.usersService.findByEmail(dto.email);
        if (!user || !user.password) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const passwordValid = await bcrypt.compare(dto.password, user.password);
        if (!passwordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('Account is not activated. Check your invitation email.');
        }

        const payload = { sub: user.id, email: user.email, role: user.role };
        return {
            accessToken: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
        };
    }

    // ─── Invite ──────────────────────────────────────────────────────
    async invite(dto: InviteUserDto) {
        const token = randomUUID();

        const user = await this.usersService.createInvitedUser({
            email: dto.email,
            role: dto.role,
            invitationToken: token,
        });

        // Assign hotels if provided
        if (dto.hotelIds && dto.hotelIds.length > 0) {
            await this.usersService.update(user.id, { hotelIds: dto.hotelIds });
        }

        this.mailService.sendUserInvitation(dto.email, token);

        return { message: `Invitation sent to ${dto.email}` };
    }

    // ─── Accept Invite ───────────────────────────────────────────────
    async acceptInvite(dto: AcceptInviteDto) {
        const user = await this.usersService.findByInvitationToken(dto.token);
        if (!user) {
            throw new BadRequestException('Invalid or expired invitation token');
        }

        user.firstName = dto.firstName;
        user.lastName = dto.lastName;
        user.password = await bcrypt.hash(dto.password, SALT_ROUNDS);
        user.isActive = true;
        user.invitationToken = null as unknown as string;

        await this.usersService.save(user);

        const payload = { sub: user.id, email: user.email, role: user.role };
        return {
            accessToken: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
        };
    }

    // ─── Forgot Password ────────────────────────────────────────────
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

    // ─── Reset Password ─────────────────────────────────────────────
    async resetPassword(dto: ResetPasswordDto) {
        const user = await this.usersService.findByResetToken(dto.token);
        if (!user) {
            throw new BadRequestException('Invalid or expired reset token');
        }

        user.password = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
        user.resetPasswordToken = null as unknown as string;
        await this.usersService.save(user);

        return { message: 'Password has been reset successfully.' };
    }
}
