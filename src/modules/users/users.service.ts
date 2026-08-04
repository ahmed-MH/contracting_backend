import { Injectable, ConflictException, BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../../common/audit/audit.service';
import { AuditLogCategory } from '../../common/audit/audit.types';
import { User } from './entities/user.entity';
import { UserRole } from '../../common/constants/enums';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Hotel } from '../hotel/entities/hotel.entity';
import { RequestUser } from '../../common/interfaces/request.interface';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
        private readonly auditService: AuditService,
    ) { }

    async findByEmail(email: string): Promise<User | null> {
        return this.userRepo.findOne({ where: { email }, relations: ['hotels'] });
    }

    async findById(id: number): Promise<User | null> {
        return this.userRepo.findOne({ where: { id }, relations: ['hotels', 'tenant'] });
    }

    async findCurrentProfile(id: number): Promise<ReturnType<UsersService['sanitizeUser']>> {
        const user = await this.userRepo.findOne({ where: { id }, relations: ['hotels', 'tenant'] });
        if (!user) {
            throw new NotFoundException(`User #${id} not found`);
        }

        return this.sanitizeUser(user);
    }

    async findByInvitationToken(token: string): Promise<User | null> {
        return this.userRepo.findOne({ where: { invitationToken: token, invitationCanceledAt: IsNull() } });
    }

    async findByResetToken(token: string): Promise<User | null> {
        return this.userRepo.findOne({ where: { resetPasswordToken: token } });
    }

    async findAdmin(): Promise<User | null> {
        return this.userRepo.findOne({ where: { role: UserRole.ADMIN } });
    }

    async createInvitedUser(data: {
        email: string;
        role: UserRole;
        invitationToken: string;
        tenantId?: number | null;
    }): Promise<User> {
        const existing = await this.findByEmail(data.email);
        if (existing) {
            if (this.isCanceledPendingInvite(existing) && existing.tenantId === data.tenantId) {
                existing.role = data.role;
                existing.invitationToken = data.invitationToken;
                existing.invitationCanceledAt = null;
                existing.invitationCanceledByUserId = null;
                existing.isActive = false;
                existing.tenantId = (data.tenantId ?? undefined) as unknown as number;
                existing.hotels = [];
                return this.userRepo.save(existing);
            }
            throw new ConflictException(`Email "${data.email}" is already registered`);
        }
        const user = this.userRepo.create({
            email: data.email,
            role: data.role,
            invitationToken: data.invitationToken,
            isActive: false,
            tenantId: data.tenantId || undefined,
        });
        return this.userRepo.save(user);
    }

    async createSeedAdmin(data: {
        email: string;
        firstName: string;
        lastName: string;
        password: string;
        role: UserRole;
        tenantId?: number | null;
    }): Promise<User> {
        const user = this.userRepo.create({
            ...data,
            isActive: true,
            tenantId: data.tenantId || undefined,
        });
        return this.userRepo.save(user);
    }

    async save(user: User): Promise<User> {
        return this.userRepo.save(user);
    }

    private getAccountStatus(user: User): 'ACTIVE' | 'PENDING_INVITE' | 'SUSPENDED' {
        if (user.deletedAt) {
            return 'SUSPENDED';
        }

        if (user.isActive) {
            return 'ACTIVE';
        }

        return user.invitationToken && !user.invitationCanceledAt ? 'PENDING_INVITE' : 'SUSPENDED';
    }

    private sanitizeUser(user: User) {
        const { password, invitationToken, resetPasswordToken, ...rest } = user;
        void password;
        void invitationToken;
        void resetPasswordToken;

        return {
            ...rest,
            accountStatus: this.getAccountStatus(user),
        };
    }

    async findAll(currentUser: RequestUser): Promise<ReturnType<UsersService['sanitizeUser']>[]> {
        let users: User[] = [];

        if (currentUser.role === UserRole.ADMIN) {
            users = await this.userRepo.find({
                where: { tenantId: currentUser.tenantId ?? IsNull() },
                relations: ['hotels'],
                withDeleted: true,
            });
            users = users.filter((user) => !this.isCanceledPendingInvite(user));
        } else if (currentUser.role === UserRole.COMMERCIAL || currentUser.role === UserRole.AGENT) {
            const self = await this.userRepo.findOne({
                where: { id: currentUser.id },
                relations: ['hotels'],
            });

            if (!self) {
                return [];
            }

            const hotelIds = self.hotels?.map((hotel) => hotel.id) ?? [];
            if (hotelIds.length === 0) {
                users = [self];
            } else {
                users = await this.userRepo
                    .createQueryBuilder('user')
                    .leftJoinAndSelect('user.hotels', 'hotel')
                    .where('hotel.id IN (:...hotelIds)', { hotelIds })
                    .getMany();
            }
        }

        return users.map((user) => this.sanitizeUser(user));
    }

    async cancelPendingInvite(userId: number, currentUser: RequestUser): Promise<{ message: string; userId: number }> {
        if (currentUser.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only tenant administrators can remove pending invites.');
        }

        if (!currentUser.tenantId) {
            throw new ForbiddenException('No active tenant is associated with this user.');
        }

        if (currentUser.id === userId) {
            throw new BadRequestException('You cannot remove your own invite.');
        }

        const invitedUser = await this.userRepo.findOne({ where: { id: userId }, relations: ['hotels'] });
        if (!invitedUser || invitedUser.tenantId !== currentUser.tenantId) {
            throw new NotFoundException(`Pending invite #${userId} not found`);
        }

        if (invitedUser.isActive || !invitedUser.invitationToken || invitedUser.invitationCanceledAt) {
            throw new BadRequestException('Only pending invites can be removed.');
        }

        invitedUser.invitationCanceledAt = new Date();
        invitedUser.invitationCanceledByUserId = currentUser.id;
        invitedUser.invitationToken = null as unknown as string;
        invitedUser.isActive = false;
        invitedUser.hotels = [];

        await this.userRepo.save(invitedUser);
        await this.auditService.log({
            eventType: 'INVITE_CANCELED',
            category: AuditLogCategory.INVITE,
            message: `Pending invite for ${invitedUser.email} was removed`,
            actor: await this.auditService.resolveActor(currentUser),
            tenantId: currentUser.tenantId,
            targetType: 'user',
            targetId: invitedUser.id,
            metadata: { invitedEmail: invitedUser.email, invitedRole: invitedUser.role },
        });

        return {
            message: 'Pending invite removed. The invite link is no longer valid.',
            userId: invitedUser.id,
        };
    }

    async update(id: number, dto: UpdateUserDto, currentUser?: RequestUser): Promise<User> {
        const user = await this.userRepo.findOne({ where: { id }, relations: ['hotels'] });
        if (!user) {
            throw new ConflictException(`User #${id} not found`);
        }

        // 1. Update scalar fields
        if (dto.firstName) user.firstName = dto.firstName;
        if (dto.lastName) user.lastName = dto.lastName;

        // 2. Role change logic
        const effectiveRole = dto.role ?? user.role;
        if (
            currentUser?.id === id
            && user.role === UserRole.ADMIN
            && dto.role
            && dto.role !== UserRole.ADMIN
        ) {
            const tenantId = user.tenantId ?? currentUser.tenantId;
            const activeAdminCount = await this.userRepo.count({
                where: {
                    tenantId: tenantId === null ? IsNull() : tenantId,
                    role: UserRole.ADMIN,
                    isActive: true,
                },
            });

            if (activeAdminCount <= 1) {
                throw new BadRequestException('You must keep at least one active administrator.');
            }
        }

        if (dto.role) user.role = dto.role;

        // 3. Hotel assignment based on role
        if (effectiveRole === UserRole.ADMIN) {
            // ADMIN is global — always clear hotel assignments
            user.hotels = [];
        } else if (dto.hotelIds !== undefined) {
            // COMMERCIAL/AGENT: assign hotels (validate at least one)
            if (dto.hotelIds.length === 0) {
                throw new BadRequestException('This role must be assigned to at least one hotel.');
            }
            const hotels = await this.hotelRepo.findByIds(dto.hotelIds);
            user.hotels = hotels;
        } else if (dto.role && (effectiveRole === UserRole.COMMERCIAL || effectiveRole === UserRole.AGENT) && (!user.hotels || user.hotels.length === 0)) {
            throw new BadRequestException('This role must be assigned to at least one hotel.');
        }

        return this.userRepo.save(user);
    }

    async updateCurrentProfile(id: number, dto: UpdateCurrentUserDto): Promise<ReturnType<UsersService['sanitizeUser']>> {
        const user = await this.userRepo.findOne({ where: { id }, relations: ['hotels', 'tenant'] });
        if (!user) {
            throw new NotFoundException(`User #${id} not found`);
        }

        if (dto.firstName !== undefined) {
            user.firstName = dto.firstName.trim();
        }

        if (dto.lastName !== undefined) {
            user.lastName = dto.lastName.trim();
        }

        const saved = await this.userRepo.save(user);
        return this.sanitizeUser(saved);
    }

    async changeCurrentPassword(id: number, dto: ChangePasswordDto): Promise<{ message: string }> {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user || !user.password) {
            throw new UnauthorizedException('Current password is invalid.');
        }

        const passwordValid = await bcrypt.compare(dto.currentPassword, user.password);
        if (!passwordValid) {
            throw new UnauthorizedException('Current password is invalid.');
        }

        user.password = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
        await this.userRepo.save(user);
        await this.auditService.logAuth({
            eventType: 'PASSWORD_CHANGED',
            message: `Password was changed for ${user.email}`,
            actorUserId: user.id,
            actorEmail: user.email,
            actorRole: user.role,
            tenantId: user.tenantId ?? null,
        });

        return { message: 'Password changed successfully.' };
    }

    async findAssignedHotels(userId: number): Promise<Hotel[]> {
        const user = await this.userRepo.findOne({
            where: { id: userId },
            relations: ['hotels', 'hotels.bankAccounts'],
        });
        return user?.hotels ?? [];
    }

    async suspend(id: number, currentUser?: RequestUser): Promise<ReturnType<UsersService['sanitizeUser']>> {
        if (currentUser?.id === id) {
            throw new ForbiddenException('You cannot suspend your own account.');
        }

        const user = await this.userRepo.findOne({ where: { id }, relations: ['hotels'] });
        if (!user) {
            throw new ConflictException(`User #${id} not found`);
        }

        user.isActive = false;
        user.invitationToken = null as unknown as string;
        const saved = await this.userRepo.save(user);

        return this.sanitizeUser(saved);
    }

    async reactivate(id: number): Promise<ReturnType<UsersService['sanitizeUser']>> {
        const user = await this.userRepo.findOne({
            where: { id },
            relations: ['hotels'],
            withDeleted: true,
        });
        if (!user) {
            throw new ConflictException(`User #${id} not found`);
        }

        if (!user.password) {
            throw new BadRequestException('This user has not accepted an invitation yet. Send a new invitation instead.');
        }

        if (user.deletedAt) {
            await this.userRepo.recover(user);
            user.deletedAt = undefined;
        }

        user.isActive = true;
        const saved = await this.userRepo.save(user);

        return this.sanitizeUser(saved);
    }

    async remove(id: number): Promise<ReturnType<UsersService['sanitizeUser']>> {
        return this.suspend(id);
    }

    private isCanceledPendingInvite(user: User): boolean {
        return Boolean(user.invitationCanceledAt && !user.isActive && !user.password);
    }
}
