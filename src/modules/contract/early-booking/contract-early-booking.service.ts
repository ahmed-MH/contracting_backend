import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ContractEarlyBooking } from './entities/contract-early-booking.entity';
import { ContractEarlyBookingRoom } from './entities/contract-early-booking-room.entity';
import { ContractEarlyBookingPeriod } from './entities/contract-early-booking-period.entity';
import { Contract } from '../core/entities/contract.entity';
import { ContractRoom } from '../core/entities/contract-room.entity';
import { Period } from '../core/entities/period.entity';
import { TemplateEarlyBooking } from '../../catalog/early-booking/entities/template-early-booking.entity';
import { UpdateContractEarlyBookingDto } from './dto/update-contract-early-booking.dto';

@Injectable()
export class ContractEarlyBookingService {
    constructor(
        @InjectRepository(ContractEarlyBooking)
        private readonly ebRepo: Repository<ContractEarlyBooking>,

        @InjectRepository(ContractEarlyBookingRoom)
        private readonly ebRoomRepo: Repository<ContractEarlyBookingRoom>,

        @InjectRepository(ContractEarlyBookingPeriod)
        private readonly ebPeriodRepo: Repository<ContractEarlyBookingPeriod>,

        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,

        @InjectRepository(ContractRoom)
        private readonly contractRoomRepo: Repository<ContractRoom>,

        @InjectRepository(Period)
        private readonly periodRepo: Repository<Period>,

        @InjectRepository(TemplateEarlyBooking)
        private readonly templateRepo: Repository<TemplateEarlyBooking>,
    ) { }

    private async findContractOrThrow(hotelId: number, contractId: number): Promise<Contract> {
        const contract = await this.contractRepo.findOne({
            where: { id: contractId, hotelId },
        });
        if (!contract) {
            throw new NotFoundException(`Contract #${contractId} not found in hotel #${hotelId}`);
        }
        return contract;
    }

    private async findEarlyBookingOrThrow(
        hotelId: number,
        id: number,
        relations: string[] = [],
    ): Promise<ContractEarlyBooking> {
        const eb = await this.ebRepo.findOne({
            where: { id, contract: { hotelId } },
            relations: ['contract', ...relations],
        });
        if (!eb) {
            throw new NotFoundException(`ContractEarlyBooking #${id} not found in hotel #${hotelId}`);
        }
        return eb;
    }

    private assertAllFound(resource: string, requestedIds: number[], foundCount: number, contractId: number): void {
        const uniqueIds = [...new Set(requestedIds)];
        if (foundCount !== uniqueIds.length) {
            throw new NotFoundException(`${resource} not found in contract #${contractId}`);
        }
    }

    private async findContractRoomsOrThrow(hotelId: number, contractId: number, ids: number[]): Promise<ContractRoom[]> {
        const uniqueIds = [...new Set(ids)];
        if (uniqueIds.length === 0) return [];

        const rooms = await this.contractRoomRepo.find({
            where: { id: In(uniqueIds), contract: { id: contractId, hotelId } },
        });
        this.assertAllFound('ContractRoom', uniqueIds, rooms.length, contractId);
        return rooms;
    }

    private async findPeriodsOrThrow(hotelId: number, contractId: number, ids: number[]): Promise<Period[]> {
        const uniqueIds = [...new Set(ids)];
        if (uniqueIds.length === 0) return [];

        const periods = await this.periodRepo.find({
            where: { id: In(uniqueIds), contract: { id: contractId, hotelId } },
        });
        this.assertAllFound('Period', uniqueIds, periods.length, contractId);
        return periods;
    }

    // Fetch all early bookings for a given contract (with targeting)
    async findByContract(hotelId: number, contractId: number): Promise<ContractEarlyBooking[]> {
        await this.findContractOrThrow(hotelId, contractId);
        return this.ebRepo.find({
            where: { contract: { id: contractId, hotelId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
            order: { id: 'DESC' },
        });
    }

    // Clone a TemplateEarlyBooking into a ContractEarlyBooking (verifies hotelId)
    async importFromTemplate(
        hotelId: number,
        contractId: number,
        templateId: number,
    ): Promise<ContractEarlyBooking> {
        const contract = await this.findContractOrThrow(hotelId, contractId);

        const template = await this.templateRepo.findOne({
            where: { id: templateId, hotel: { id: hotelId } },
        });
        if (!template) {
            throw new NotFoundException(`TemplateEarlyBooking #${templateId} not found in hotel #${hotelId}`);
        }

        // Clone template values — independent copy, no targeting initially
        const eb = this.ebRepo.create({
            name: template.name,
            calculationType: template.calculationType,
            value: template.value,
            applicationType: template.applicationType,
            releaseDays: template.releaseDays,
            bookingWindowStart: template.bookingWindowStart,
            bookingWindowEnd: template.bookingWindowEnd,
            stayWindowStart: template.stayWindowStart,
            stayWindowEnd: template.stayWindowEnd,
            isPrepaid: template.isPrepaid,
            prepaymentPercentage: template.prepaymentPercentage,
            prepaymentDeadlineDate: template.prepaymentDeadlineDate,
            roomingListDeadlineDate: template.roomingListDeadlineDate,
            templateId: template.id,
            contract,
        });

        const savedEb = await this.ebRepo.save(eb);

        const periods = await this.periodRepo.find({ where: { contract: { id: contractId, hotelId } } });
        const periodJunctions = periods.map(period => this.ebPeriodRepo.create({ contractEarlyBooking: savedEb, period }));
        await this.ebPeriodRepo.save(periodJunctions);

        return savedEb;
    }

    // Update early booking values and/or targeting
    async update(
        hotelId: number,
        id: number,
        dto: UpdateContractEarlyBookingDto,
    ): Promise<ContractEarlyBooking> {
        const eb = await this.findEarlyBookingOrThrow(hotelId, id, [
            'applicableContractRooms',
            'applicablePeriods',
        ]);
        const contractId = eb.contract.id;

        if (dto.applicableContractRoomIds?.length) {
            await this.findContractRoomsOrThrow(hotelId, contractId, dto.applicableContractRoomIds);
        }
        if (dto.applicablePeriods?.length) {
            await this.findPeriodsOrThrow(hotelId, contractId, dto.applicablePeriods.map(ap => ap.periodId));
        }

        // Update scalar fields
        if (dto.reference !== undefined) eb.reference = dto.reference || (null as any);
        if (dto.name !== undefined) eb.name = dto.name;
        if (dto.calculationType !== undefined) eb.calculationType = dto.calculationType;
        if (dto.value !== undefined) eb.value = dto.value;
        if (dto.applicationType !== undefined) eb.applicationType = dto.applicationType;
        if (dto.releaseDays !== undefined) eb.releaseDays = dto.releaseDays;
        if (dto.bookingWindowStart !== undefined) eb.bookingWindowStart = dto.bookingWindowStart;
        if (dto.bookingWindowEnd !== undefined) eb.bookingWindowEnd = dto.bookingWindowEnd;
        if (dto.stayWindowStart !== undefined) eb.stayWindowStart = dto.stayWindowStart;
        if (dto.stayWindowEnd !== undefined) eb.stayWindowEnd = dto.stayWindowEnd;
        if (dto.isPrepaid !== undefined) eb.isPrepaid = dto.isPrepaid;
        if (dto.prepaymentPercentage !== undefined) eb.prepaymentPercentage = dto.prepaymentPercentage;
        if (dto.prepaymentDeadlineDate !== undefined) eb.prepaymentDeadlineDate = dto.prepaymentDeadlineDate;
        if (dto.roomingListDeadlineDate !== undefined) eb.roomingListDeadlineDate = dto.roomingListDeadlineDate;

        await this.ebRepo.save(eb);

        // Update targeting — rooms (full replacement)
        if (dto.applicableContractRoomIds !== undefined) {
            const rooms = dto.applicableContractRoomIds.length > 0
                ? await this.findContractRoomsOrThrow(hotelId, contractId, dto.applicableContractRoomIds)
                : [];
            await this.ebRoomRepo.delete({ contractEarlyBooking: { id } });

            if (dto.applicableContractRoomIds.length > 0) {
                const junctions = rooms.map((room) =>
                    this.ebRoomRepo.create({ contractEarlyBooking: eb, contractRoom: room }),
                );
                await this.ebRoomRepo.save(junctions);
            }
        }

        // Update targeting — periods (full replacement)
        if (dto.applicablePeriods !== undefined) {
            const periods = dto.applicablePeriods.length > 0
                ? await this.findPeriodsOrThrow(hotelId, contractId, dto.applicablePeriods.map(ap => ap.periodId))
                : [];
            await this.ebPeriodRepo.delete({ contractEarlyBooking: { id } });

            if (dto.applicablePeriods.length > 0) {
                const junctions = dto.applicablePeriods.map((ap) => {
                    const period = periods.find(p => p.id === ap.periodId);
                    if (!period) return null;
                    return this.ebPeriodRepo.create({
                        contractEarlyBooking: eb,
                        period,
                        overrideValue: ap.overrideValue,
                    });
                }).filter(j => j !== null);
                if (junctions.length > 0) {
                    await this.ebPeriodRepo.save(junctions as ContractEarlyBookingPeriod[]);
                }
            }
        }

        // Reload with fresh relations
        return this.ebRepo.findOne({
            where: { id, contract: { hotelId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
        }) as Promise<ContractEarlyBooking>;
    }

    // Hard delete a contract early booking
    async remove(hotelId: number, id: number): Promise<void> {
        const eb = await this.findEarlyBookingOrThrow(hotelId, id);
        await this.ebRepo.remove(eb);
    }
}
