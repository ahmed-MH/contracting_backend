import {
    EntitySubscriberInterface,
    EventSubscriber,
    InsertEvent,
    DataSource,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { Affiliate } from '../../modules/affiliate/entities/affiliate.entity';
import { RoomType } from '../../modules/hotel/entities/room-type.entity';
import { Contract } from '../../modules/contract/entities/contract.entity';

@Injectable()
@EventSubscriber()
export class CustomIdSubscriber implements EntitySubscriberInterface {
    constructor(dataSource: DataSource) {
        dataSource.subscribers.push(this);
    }

    /**
     * Called before entity insertion.
     */
    async beforeInsert(event: InsertEvent<any>) {
        if (event.entity instanceof Affiliate) {
            await this.generateAffiliateId(event as InsertEvent<Affiliate>);
        } else if (event.entity instanceof RoomType) {
            await this.generateRoomTypeId(event as InsertEvent<RoomType>);
        } else if (event.entity instanceof Contract) {
            await this.generateContractId(event as InsertEvent<Contract>);
        }
    }

    private async generateAffiliateId(event: InsertEvent<Affiliate>) {
        if (event.entity.displayId) return; // Allow manual override

        const manager = event.manager;
        const lastEntity = await manager.getRepository(Affiliate).findOne({
            where: {},
            order: { id: 'DESC' },
        });

        const lastId = lastEntity?.displayId
            ? parseInt(lastEntity.displayId.replace('AFF-', ''), 10)
            : 0;

        const nextId = lastId + 1;
        event.entity.displayId = `AFF-${nextId.toString().padStart(3, '0')}`;
    }

    private async generateRoomTypeId(event: InsertEvent<RoomType>) {
        if (event.entity.displayId) return;

        const manager = event.manager;
        const lastEntity = await manager.getRepository(RoomType).findOne({
            where: {},
            order: { id: 'DESC' },
        });

        // Handle cases where older records might not have displayId
        // Ideally we should count or rely on a sequence, but user requirement is "Last Entity + 1"
        // If last entity has no displayId, we start from 0 assuming migration script handles others or we just start fresh
        let lastId = 0;
        if (lastEntity?.displayId) {
            const parts = lastEntity.displayId.split('RT-');
            if (parts.length > 1 && !isNaN(parseInt(parts[1]))) {
                lastId = parseInt(parts[1], 10);
            }
        }

        const nextId = lastId + 1;
        event.entity.displayId = `RT-${nextId.toString().padStart(3, '0')}`;
    }

    private async generateContractId(event: InsertEvent<Contract>) {
        if (event.entity.displayId) return;

        const startDate = new Date(event.entity.startDate);
        const year = startDate.getFullYear();
        const prefix = `CTR-${year}-`;

        const manager = event.manager;

        // Find the last contract for this year
        // We need to use QueryBuilder because we want to filter by displayId pattern
        const lastEntity = await manager
            .getRepository(Contract)
            .createQueryBuilder('contract')
            .where('contract.displayId LIKE :pattern', { pattern: `${prefix}%` })
            .orderBy('contract.id', 'DESC')
            .getOne();

        let lastSequence = 0;
        if (lastEntity?.displayId) {
            const parts = lastEntity.displayId.replace(prefix, '');
            if (!isNaN(parseInt(parts))) {
                lastSequence = parseInt(parts, 10);
            }
        }

        const nextSequence = lastSequence + 1;
        event.entity.displayId = `${prefix}${nextSequence.toString().padStart(3, '0')}`;
    }
}
