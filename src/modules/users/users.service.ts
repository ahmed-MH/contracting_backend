import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserRole } from '../../common/constants/enums';
import { UpdateUserDto } from './dto/update-user.dto';
import { Hotel } from '../hotel/entities/hotel.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
    ) { }

    async findByEmail(email: string): Promise<User | null> {
        return this.userRepo.findOne({ where: { email }, relations: ['hotels'] });
    }

    async findById(id: number): Promise<User | null> {
        return this.userRepo.findOne({ where: { id }, relations: ['hotels'] });
    }

    async findByInvitationToken(token: string): Promise<User | null> {
        return this.userRepo.findOne({ where: { invitationToken: token } });
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
    }): Promise<User> {
        const existing = await this.findByEmail(data.email);
        if (existing) {
            throw new ConflictException(`Email "${data.email}" is already registered`);
        }
        const user = this.userRepo.create({
            email: data.email,
            role: data.role,
            invitationToken: data.invitationToken,
            isActive: false,
        });
        return this.userRepo.save(user);
    }

    async createSeedAdmin(data: {
        email: string;
        firstName: string;
        lastName: string;
        password: string;
        role: UserRole;
    }): Promise<User> {
        const user = this.userRepo.create({
            ...data,
            isActive: true,
        });
        return this.userRepo.save(user);
    }

    async save(user: User): Promise<User> {
        return this.userRepo.save(user);
    }

    async findAll(): Promise<Omit<User, 'password'>[]> {
        const users = await this.userRepo.find({ relations: ['hotels'] });
        return users.map(({ password, ...rest }) => { void password; return rest; });
    }

    async update(id: number, dto: UpdateUserDto): Promise<User> {
        const user = await this.userRepo.findOne({ where: { id }, relations: ['hotels'] });
        if (!user) {
            throw new ConflictException(`User #${id} not found`);
        }

        // 1. Update scalar fields
        if (dto.firstName) user.firstName = dto.firstName;
        if (dto.lastName) user.lastName = dto.lastName;

        // 2. Role change logic
        const effectiveRole = dto.role ?? user.role;
        if (dto.role) user.role = dto.role;

        // 3. Hotel assignment based on role
        if (effectiveRole === UserRole.ADMIN) {
            // ADMIN is global — always clear hotel assignments
            user.hotels = [];
        } else if (dto.hotelIds !== undefined) {
            // COMMERCIAL — assign hotels (validate at least one)
            if (dto.hotelIds.length === 0) {
                throw new BadRequestException('Un COMMERCIAL doit être assigné à au moins un hôtel.');
            }
            const hotels = await this.hotelRepo.findByIds(dto.hotelIds);
            user.hotels = hotels;
        }

        return this.userRepo.save(user);
    }

    async findAssignedHotels(userId: number): Promise<Hotel[]> {
        const user = await this.userRepo.findOne({
            where: { id: userId },
            relations: ['hotels'],
        });
        return user?.hotels ?? [];
    }

    async remove(id: number): Promise<void> {
        await this.userRepo.softDelete(id);
    }
}
