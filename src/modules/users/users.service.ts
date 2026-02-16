import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UserRole } from '../../shared/constants/enums';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) { }

    /**
     * Creates a new user with a hashed password.
     * Throws ConflictException if the email is already taken.
     */
    async create(dto: CreateUserDto): Promise<Omit<User, 'password'>> {
        const existing = await this.userRepo.findOne({ where: { email: dto.email } });
        if (existing) {
            throw new ConflictException(`Email "${dto.email}" is already registered`);
        }

        const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

        const user = this.userRepo.create({
            ...dto,
            password: hashedPassword,
            role: dto.role ?? UserRole.AGENT,
        });

        const saved = await this.userRepo.save(user);

        // Strip password from the response
        const { password: _, ...result } = saved;
        return result;
    }

    /**
     * Finds a user by email — used by the Auth module for login.
     * Returns the full entity including the hashed password.
     */
    async findByEmail(email: string): Promise<User | null> {
        return this.userRepo.findOne({ where: { email } });
    }

    async findAll(): Promise<Omit<User, 'password'>[]> {
        const users = await this.userRepo.find();
        return users.map(({ password: _, ...rest }) => rest);
    }
}
