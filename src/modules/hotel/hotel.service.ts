import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Hotel } from './entities/hotel.entity';
import { CreateHotelDto, HotelBankAccountDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { UserRole } from '../../common/constants/enums';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { RequestUser } from '../../common/interfaces/request.interface';
import { AuditService } from '../../common/audit/audit.service';
import { HotelBankAccount } from './entities/hotel-bank-account.entity';
import { AuditActor } from '../../common/audit/audit.types';

interface UploadedLogoFile {
    mimetype: string;
    buffer: Buffer;
}

@Injectable()
export class HotelService {
    private static readonly ALLOWED_LOGO_MIME_TYPES = new Map<string, string>([
        ['image/png', '.png'],
        ['image/jpeg', '.jpg'],
    ]);

    /* istanbul ignore next */
    constructor(
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
        @InjectRepository(HotelBankAccount)
        private readonly hotelBankAccountRepo: Repository<HotelBankAccount>,
        private readonly auditService: AuditService,
    ) { }

    // ─── Hotel ────────────────────────────────────────────────────────

    async createHotel(dto: CreateHotelDto, currentUser: RequestUser): Promise<Hotel> {
        const actor = await this.auditService.resolveActor(currentUser);
        const { bankAccounts, ...hotelFields } = dto;
        const normalizedBankAccounts = this.normalizeBankAccounts(bankAccounts, hotelFields);
        const hotel = this.hotelRepo.create({
            ...hotelFields,
            tenantId: currentUser.tenantId || undefined,
        });
        this.syncLegacyBankFieldsFromPrincipal(hotel, normalizedBankAccounts);
        this.auditService.applyCreateAudit(hotel, actor);
        const savedHotel = await this.hotelRepo.save(hotel);

        if (normalizedBankAccounts.length > 0) {
            await this.replaceHotelBankAccounts(savedHotel.id, normalizedBankAccounts, actor);
            return this.findById(savedHotel.id, currentUser) as Promise<Hotel>;
        }

        return savedHotel;
    }

    async findById(
        id: number,
        user?: { id: number; role: UserRole; tenantId: number | null },
    ): Promise<Hotel | null> {
        if (!user) {
            return this.hotelRepo.findOne({ where: { id }, relations: ['bankAccounts'] });
        }

        if (user.role === UserRole.SUPERVISOR) {
            return this.hotelRepo.findOne({ where: { id }, relations: ['bankAccounts'] });
        }

        if (user.role === UserRole.ADMIN) {
            const tenantCondition = user.tenantId ?? IsNull();
            return this.hotelRepo.findOne({ where: { id, tenantId: tenantCondition }, relations: ['bankAccounts'] });
        }

        if (user.role === UserRole.COMMERCIAL || user.role === UserRole.AGENT) {
            return this.hotelRepo.findOne({
                where: { id, users: { id: user.id } },
                relations: ['users', 'bankAccounts'],
            });
        }

        return this.hotelRepo.findOne({ where: { id }, relations: ['bankAccounts'] });
    }

    async findAllHotels(user?: { id: number; role: UserRole; tenantId: number | null }): Promise<Hotel[]> {
        if (!user) return this.hotelRepo.find({ relations: ['bankAccounts'] });

        if (user.role === UserRole.SUPERVISOR) {
            return this.hotelRepo.find({ relations: ['bankAccounts'] });
        }

        if (user.role === UserRole.ADMIN) {
            return this.hotelRepo.find({
                where: { tenantId: user.tenantId ?? IsNull() },
                relations: ['bankAccounts'],
            });
        }

        if (user.role === UserRole.COMMERCIAL || user.role === UserRole.AGENT) {
            return this.hotelRepo.find({
                where: {
                    users: { id: user.id }
                },
                relations: ['users', 'bankAccounts']
            });
        }

        return this.hotelRepo.find({ relations: ['bankAccounts'] });
    }

    async findArchivedHotels(user?: RequestUser): Promise<Hotel[]> {
        if (!user) {
            return this.hotelRepo.find({
                withDeleted: true,
                where: { deletedAt: Not(IsNull()) },
            });
        }

        if (user.role === UserRole.ADMIN) {
            return this.hotelRepo.find({
                withDeleted: true,
                where: {
                    deletedAt: Not(IsNull()),
                    tenantId: user.tenantId ?? IsNull(),
                },
            });
        }

        return this.hotelRepo.find({
            withDeleted: true,
            where: { deletedAt: Not(IsNull()) },
        });
    }

    async updateHotel(id: number, dto: UpdateHotelDto, currentUser?: RequestUser): Promise<Hotel> {
        const hotel = await this.findById(id, currentUser);
        if (!hotel) {
            throw new NotFoundException(`Hotel #${id} not found`);
        }

        const actor = await this.auditService.resolveActor(currentUser);
        const { bankAccounts, ...hotelFields } = dto;
        Object.assign(hotel, hotelFields);

        const shouldReplaceBankAccounts = bankAccounts !== undefined;
        const normalizedBankAccounts = shouldReplaceBankAccounts
            ? this.normalizeBankAccounts(bankAccounts, hotel)
            : [];

        if (shouldReplaceBankAccounts) {
            this.syncLegacyBankFieldsFromPrincipal(hotel, normalizedBankAccounts);
        }

        this.auditService.applyUpdateAudit(hotel, actor);
        const savedHotel = await this.hotelRepo.save(hotel);

        if (shouldReplaceBankAccounts) {
            await this.replaceHotelBankAccounts(savedHotel.id, normalizedBankAccounts, actor);
            return this.findById(savedHotel.id, currentUser) as Promise<Hotel>;
        }

        if (this.hasLegacyBankFieldUpdate(dto)) {
            await this.upsertPrincipalBankAccountFromLegacy(savedHotel, actor);
            return this.findById(savedHotel.id, currentUser) as Promise<Hotel>;
        }

        return savedHotel;
    }

    async updateHotelLogo(id: number, file: UploadedLogoFile, currentUser?: RequestUser): Promise<Hotel> {
        const hotel = await this.findById(id, currentUser);
        if (!hotel) {
            throw new NotFoundException(`Hotel #${id} not found`);
        }

        const extension = HotelService.ALLOWED_LOGO_MIME_TYPES.get(file.mimetype);
        if (!extension) {
            throw new BadRequestException('Unsupported logo format. Please upload a PNG or JPG image.');
        }

        if (!file.buffer?.length) {
            throw new BadRequestException('The uploaded logo file is empty');
        }

        const uploadsDirectory = join(process.cwd(), 'uploads', 'hotels', 'logos');
        await mkdir(uploadsDirectory, { recursive: true });

        const filename = `hotel-${id}-${Date.now()}-${randomUUID()}${extension}`;
        const absolutePath = join(uploadsDirectory, filename);
        await writeFile(absolutePath, file.buffer);

        hotel.logoUrl = `/uploads/hotels/logos/${filename}`;
        const actor = await this.auditService.resolveActor(currentUser);
        this.auditService.applyUpdateAudit(hotel, actor);
        return this.hotelRepo.save(hotel);
    }

    async removeHotel(id: number, currentUser?: RequestUser): Promise<void> {
        const hotel = await this.findById(id, currentUser);
        if (!hotel) {
            throw new NotFoundException(`Hotel #${id} not found`);
        }

        await this.hotelRepo.softDelete(hotel.id);
    }

    async restoreHotel(id: number, currentUser?: RequestUser): Promise<void> {
        const hotel = await this.findArchivedHotelById(id, currentUser);
        if (!hotel) {
            throw new NotFoundException(`Hotel #${id} not found or not archived`);
        }

        await this.hotelRepo.restore(hotel.id);
    }

    private async findArchivedHotelById(id: number, currentUser?: RequestUser): Promise<Hotel | null> {
        if (!currentUser || currentUser.role === UserRole.SUPERVISOR) {
            return this.hotelRepo.findOne({
                withDeleted: true,
                where: { id, deletedAt: Not(IsNull()) },
            });
        }

        if (currentUser.role === UserRole.ADMIN) {
            return this.hotelRepo.findOne({
                withDeleted: true,
                where: {
                    id,
                    deletedAt: Not(IsNull()),
                    tenantId: currentUser.tenantId ?? IsNull(),
                },
            });
        }

        return this.hotelRepo.findOne({
            withDeleted: true,
            where: {
                id,
                deletedAt: Not(IsNull()),
                users: { id: currentUser.id },
            },
            relations: ['users'],
        });
    }

    private normalizeBankAccounts(
        bankAccounts: HotelBankAccountDto[] | undefined,
        hotelFields: Partial<CreateHotelDto | Hotel>,
    ): HotelBankAccountDto[] {
        const source = bankAccounts ?? this.buildLegacyPrincipalAccount(hotelFields);
        const accounts = source
            .map((account) => ({
                ...account,
                label: account.label?.trim() || 'Principal account',
                bankName: this.cleanOptionalText(account.bankName),
                accountNumber: this.cleanOptionalText(account.accountNumber),
                rib: this.cleanOptionalText(account.rib ?? account.accountNumber),
                iban: this.cleanOptionalText(account.iban),
                swiftCode: this.cleanOptionalText(account.swiftCode)?.toUpperCase(),
                currency: this.cleanOptionalText(account.currency ?? hotelFields.defaultCurrency)?.toUpperCase(),
                country: this.cleanOptionalText(account.country ?? 'TN')?.toUpperCase(),
                active: account.active ?? true,
                isDefault: account.isDefault ?? false,
            }))
            .filter((account) => account.active || account.id);

        const principalIndex = accounts.findIndex((account) => account.active && account.isDefault);
        const fallbackPrincipalIndex = accounts.findIndex((account) => account.active);
        const selectedPrincipalIndex = principalIndex >= 0 ? principalIndex : fallbackPrincipalIndex;

        return accounts.map((account, index) => ({
            ...account,
            isDefault: account.active && index === selectedPrincipalIndex,
        }));
    }

    private buildLegacyPrincipalAccount(hotelFields: Partial<CreateHotelDto | Hotel>): HotelBankAccountDto[] {
        if (!this.hasLegacyBankDetails(hotelFields)) return [];

        return [{
            label: 'Principal account',
            bankName: hotelFields.bankName,
            accountNumber: hotelFields.accountNumber,
            rib: hotelFields.accountNumber,
            iban: hotelFields.ibanCode,
            swiftCode: hotelFields.swiftCode,
            currency: hotelFields.defaultCurrency,
            country: 'TN',
            isDefault: true,
            active: true,
        }];
    }

    private async replaceHotelBankAccounts(
        hotelId: number,
        accounts: HotelBankAccountDto[],
        actor: AuditActor,
    ): Promise<void> {
        const existingAccounts = await this.hotelBankAccountRepo.find({ where: { hotelId } });
        const existingById = new Map(existingAccounts.map((account) => [account.id, account]));
        const keepIds = new Set<number>();

        for (const account of accounts) {
            if (account.id && !existingById.has(account.id)) {
                throw new BadRequestException(`Bank account #${account.id} does not belong to hotel #${hotelId}`);
            }
        }

        await this.hotelBankAccountRepo.update({ hotelId }, { isDefault: false });

        const entities = accounts.map((account) => {
            const entity = account.id
                ? existingById.get(account.id)!
                : this.hotelBankAccountRepo.create({ hotelId });

            if (account.id) keepIds.add(account.id);

            Object.assign(entity, account, {
                hotelId,
                active: account.active ?? true,
                isDefault: account.active ? account.isDefault : false,
            });

            if (account.id) {
                this.auditService.applyUpdateAudit(entity, actor);
            } else {
                this.auditService.applyCreateAudit(entity, actor);
            }

            return entity;
        });

        if (entities.length > 0) {
            await this.hotelBankAccountRepo.save(entities);
        }

        const omittedAccounts = existingAccounts.filter((account) => !keepIds.has(account.id));
        if (omittedAccounts.length > 0) {
            omittedAccounts.forEach((account) => {
                account.active = false;
                account.isDefault = false;
                this.auditService.applyUpdateAudit(account, actor);
            });
            await this.hotelBankAccountRepo.save(omittedAccounts);
        }
    }

    private async upsertPrincipalBankAccountFromLegacy(hotel: Hotel, actor: AuditActor): Promise<void> {
        if (!this.hasLegacyBankDetails(hotel)) return;

        const accounts = await this.hotelBankAccountRepo.find({ where: { hotelId: hotel.id } });
        const principal = accounts.find((account) => account.isDefault) ?? accounts[0] ?? this.hotelBankAccountRepo.create({ hotelId: hotel.id });

        await this.hotelBankAccountRepo.update({ hotelId: hotel.id }, { isDefault: false });
        Object.assign(principal, {
            hotelId: hotel.id,
            label: principal.label || 'Principal account',
            bankName: hotel.bankName,
            accountNumber: hotel.accountNumber,
            rib: hotel.accountNumber,
            iban: hotel.ibanCode,
            swiftCode: hotel.swiftCode,
            currency: hotel.defaultCurrency,
            country: 'TN',
            active: true,
            isDefault: true,
        });

        if (principal.id) {
            this.auditService.applyUpdateAudit(principal, actor);
        } else {
            this.auditService.applyCreateAudit(principal, actor);
        }

        await this.hotelBankAccountRepo.save(principal);
    }

    private syncLegacyBankFieldsFromPrincipal(hotel: Partial<Hotel>, accounts: HotelBankAccountDto[]): void {
        const principal = accounts.find((account) => account.active && account.isDefault) ?? accounts.find((account) => account.active);
        if (!principal) {
            hotel.bankName = undefined;
            hotel.accountNumber = undefined;
            hotel.swiftCode = undefined;
            hotel.ibanCode = undefined;
            return;
        }

        hotel.bankName = principal.bankName;
        hotel.accountNumber = principal.rib ?? principal.accountNumber;
        hotel.swiftCode = principal.swiftCode;
        hotel.ibanCode = principal.iban;
    }

    private hasLegacyBankDetails(hotelFields: Partial<CreateHotelDto | Hotel>): boolean {
        return Boolean(
            this.cleanOptionalText(hotelFields.bankName)
            || this.cleanOptionalText(hotelFields.accountNumber)
            || this.cleanOptionalText(hotelFields.swiftCode)
            || this.cleanOptionalText(hotelFields.ibanCode),
        );
    }

    private hasLegacyBankFieldUpdate(dto: UpdateHotelDto): boolean {
        return ['bankName', 'accountNumber', 'swiftCode', 'ibanCode'].some((field) => Object.prototype.hasOwnProperty.call(dto, field));
    }

    private cleanOptionalText(value: string | null | undefined): string | undefined {
        const normalized = value?.trim();
        return normalized || undefined;
    }
}
