import {
    EntitySubscriberInterface,
    EventSubscriber,
    InsertEvent,
    DataSource,
} from 'typeorm';
import { Injectable } from '@nestjs/common';

/**
 * Centralized subscriber that auto-generates a unique `reference`
 * for every entity that declares a `reference` column, when that
 * column is null/empty after insertion.
 *
 * Uses afterInsert so we have access to the auto-incremented ID.
 * Format : PREFIX + ID padded to 5 digits
 * Example: CSUP-00042
 */
@Injectable()
@EventSubscriber()
export class CustomIdSubscriber implements EntitySubscriberInterface {
    constructor(dataSource: DataSource) {
        dataSource.subscribers.push(this);
    }

    /** Entity name → prefix mapping */
    private static readonly PREFIXES: Record<string, string> = {
        Hotel: 'HTL-',
        Affiliate: 'AFF-',
        Arrangement: 'ARR-',
        Contract: 'CTR-',
        RoomType: 'RMT-',
        ContractRoom: 'CRMT-',
        ContractSupplement: 'CSUP-',
        ContractReduction: 'CRED-',
        ContractMonoparentalRule: 'CMON-',
        ContractEarlyBooking: 'CEBO-',
        TemplateSupplement: 'SUP-',
        TemplateReduction: 'RED-',
        TemplateMonoparentalRule: 'MON-',
        TemplateEarlyBooking: 'EBO-',
        TemplateSpo: 'SPO-',
        ContractSpo: 'CSPO-',
        TemplateCancellationRule: 'CAN-',
    };

    /**
     * Called AFTER entity insertion.
     * At this point event.entity.id is populated by MS SQL.
     * If the entity has a `reference` column and it's empty,
     * we build PREFIX + zero-padded ID and update the row.
     */
    async afterInsert(event: InsertEvent<any>): Promise<void> {
        const entity = event.entity as Record<string, unknown> | undefined;
        if (!entity) return;

        // Check if this entity schema actually declares a `reference` column
        const hasReferenceColumn = event.metadata.columns.some(
            (col) => col.propertyName === 'reference',
        );

        if (!hasReferenceColumn || entity['reference']) return;

        const prefix =
            CustomIdSubscriber.PREFIXES[event.metadata.targetName];
        if (!prefix) return;

        const id = entity['id'] as number;
        const reference = `${prefix}${String(id).padStart(5, '0')}`;

        // Update the row with the generated reference
        await event.manager
            .getRepository(event.metadata.target)
            .update(id, { reference });

        // Keep the in-memory entity in sync
        entity['reference'] = reference;
    }
}
