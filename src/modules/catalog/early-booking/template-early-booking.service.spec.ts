import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TemplateEarlyBookingService } from './template-early-booking.service';
import { TemplateEarlyBooking } from './entities/template-early-booking.entity';
import { NotFoundException } from '@nestjs/common';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';

describe('TemplateEarlyBookingService - Tests Unitaires ⏱️', () => {
    let service: TemplateEarlyBookingService;

    const mockRepo = {
        findAndCount: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        softDelete: jest.fn(),
        restore: jest.fn(),
    };

    const mockHotelId = 1;
    const mockId = 100;

    const mockEntity = {
        id: mockId,
        hotel: { id: mockHotelId },
        name: 'EB -15% 30 Days',
    } as unknown as TemplateEarlyBooking;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TemplateEarlyBookingService,
                { provide: getRepositoryToken(TemplateEarlyBooking), useValue: mockRepo },
            ],
        }).compile();

        service = module.get<TemplateEarlyBookingService>(TemplateEarlyBookingService);
        jest.clearAllMocks();
    });

    describe('Le Happy Path (Succès) ✅', () => {
        it('devrait créer et retourner un modèle EB', async () => {
            const createDto = { name: 'EB -15% 30 Days' } as any;
            mockRepo.create.mockReturnValue(mockEntity);
            mockRepo.save.mockResolvedValue(mockEntity);

            const result = await service.createTemplateEarlyBooking(mockHotelId, createDto);

            console.log(`[CATALOG / EARLY BOOKING] Création réussie : ${result.name} ✅`);
            expect(mockRepo.create).toHaveBeenCalledWith({ ...createDto, hotel: { id: mockHotelId } });
            expect(mockRepo.save).toHaveBeenCalledWith(mockEntity);
            expect(result).toEqual(mockEntity);
        });

        it('devrait retourner une liste paginée avec recherche dynamique', async () => {
            mockRepo.findAndCount.mockResolvedValue([[mockEntity], 1]);
            const pageOptions = new PageOptionsDto();
            pageOptions.page = 1;
            pageOptions.limit = 10;
            pageOptions.search = 'EB';

            const result = await service.findAllTemplateEarlyBookings(mockHotelId, pageOptions);

            console.log(`[CATALOG / EARLY BOOKING] Récupération de ${result.data.length} règle(s) ✅`);
            expect(result.data).toEqual([mockEntity]);
            expect(result.meta.total).toBe(1);
        });

        it('devrait retourner une liste paginée sans filtre de recherche', async () => {
            mockRepo.findAndCount.mockResolvedValue([[mockEntity], 1]);
            const pageOptions = new PageOptionsDto();
            pageOptions.page = 1;
            pageOptions.limit = 10;

            const result = await service.findAllTemplateEarlyBookings(mockHotelId, pageOptions);

            expect(result.data).toEqual([mockEntity]);
            expect(result.meta.total).toBe(1);
        });

        it('devrait retourner les règles archivées', async () => {
            mockRepo.find.mockResolvedValue([mockEntity]);

            const result = await service.findArchivedTemplateEarlyBookings(mockHotelId);

            console.log(`[CATALOG / EARLY BOOKING] Récupération des archives ✅`);
            expect(mockRepo.find).toHaveBeenCalled();
            expect(result).toEqual([mockEntity]);
        });

        it('devrait mettre à jour un modèle existant', async () => {
            const updateDto = { name: 'EB -20%' } as any;
            const updatedEntity = { ...mockEntity, name: 'EB -20%' };

            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.save.mockResolvedValue(updatedEntity);

            const result = await service.updateTemplateEarlyBooking(mockHotelId, mockId, updateDto);

            console.log(`[CATALOG / EARLY BOOKING] Mise à jour ID: ${mockId} ✅`);
            expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: mockId, hotel: { id: mockHotelId } } });
            expect(mockRepo.save).toHaveBeenCalled();
            expect(result.name).toEqual('EB -20%');
        });

        it('devrait supprimer une règle (Soft Delete)', async () => {
            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.softDelete.mockResolvedValue({ affected: 1 });

            await service.removeTemplateEarlyBooking(mockHotelId, mockId);

            console.log(`[CATALOG / EARLY BOOKING] Suppression (Soft Delete) ID: ${mockId} ✅`);
            expect(mockRepo.softDelete).toHaveBeenCalledWith(mockId);
        });

        it('devrait restaurer une règle (Restore)', async () => {
            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.restore.mockResolvedValue({ affected: 1 });

            await service.restoreTemplateEarlyBooking(mockHotelId, mockId);

            console.log(`[CATALOG / EARLY BOOKING] Restauration ID: ${mockId} ✅`);
            expect(mockRepo.restore).toHaveBeenCalledWith(mockId);
        });
    });

    // =========================================================================
    // LES CAS D'ERREURS (EXCEPTIONS)
    // =========================================================================
    describe('Les Cas d\'Erreurs (Exceptions) ❌', () => {
        it('devrait lever une NotFoundException lors de la mise à jour si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / EARLY BOOKING] Tentative mise à jour invalide ❌ (Attendu)`);
            await expect(service.updateTemplateEarlyBooking(mockHotelId, 999, {} as any)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la suppression si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / EARLY BOOKING] Tentative suppression invalide ❌ (Attendu)`);
            await expect(service.removeTemplateEarlyBooking(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la restauration si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / EARLY BOOKING] Tentative restauration invalide ❌ (Attendu)`);
            await expect(service.restoreTemplateEarlyBooking(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });
    });
});
