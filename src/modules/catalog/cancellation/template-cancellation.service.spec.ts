import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TemplateCancellationService } from './template-cancellation.service';
import { TemplateCancellationRule } from './entities/template-cancellation-rule.entity';
import { NotFoundException } from '@nestjs/common';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';

describe('TemplateCancellationService - Tests Unitaires 🚫', () => {
    let service: TemplateCancellationService;

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
        hotelId: mockHotelId,
        name: 'Standard Cancellation Rule',
    } as unknown as TemplateCancellationRule;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TemplateCancellationService,
                { provide: getRepositoryToken(TemplateCancellationRule), useValue: mockRepo },
            ],
        }).compile();

        service = module.get<TemplateCancellationService>(TemplateCancellationService);
        jest.clearAllMocks();
    });

    describe('Le Happy Path (Succès) ✅', () => {
        it('devrait créer et retourner un modèle de Cancellation', async () => {
            const createDto = { name: 'Standard Cancellation Rule' } as any;
            mockRepo.create.mockReturnValue(mockEntity);
            mockRepo.save.mockResolvedValue(mockEntity);

            const result = await service.createTemplateCancellationRule(mockHotelId, createDto);

            console.log(`[CATALOG / CANCELLATION] Création réussie : ${result.name} ✅`);
            expect(mockRepo.create).toHaveBeenCalledWith({ ...createDto, hotelId: mockHotelId });
            expect(mockRepo.save).toHaveBeenCalledWith(mockEntity);
            expect(result).toEqual(mockEntity);
        });

        it('devrait retourner une liste paginée avec recherche dynamique', async () => {
            mockRepo.findAndCount.mockResolvedValue([[mockEntity], 1]);
            const pageOptions = new PageOptionsDto();
            pageOptions.page = 1;
            pageOptions.limit = 10;
            pageOptions.search = 'Standard';

            const result = await service.findAll(mockHotelId, pageOptions);

            console.log(`[CATALOG / CANCELLATION] Récupération de ${result.data.length} règle(s) ✅`);
            expect(result.data).toEqual([mockEntity]);
            expect(result.meta.total).toBe(1);
        });

        it('devrait retourner une liste paginée sans filtre de recherche', async () => {
            mockRepo.findAndCount.mockResolvedValue([[mockEntity], 1]);
            const pageOptions = new PageOptionsDto();
            pageOptions.page = 1;
            pageOptions.limit = 10;

            const result = await service.findAll(mockHotelId, pageOptions);

            expect(result.data).toEqual([mockEntity]);
            expect(result.meta.total).toBe(1);
        });

        it('devrait retourner les règles archivées', async () => {
            mockRepo.find.mockResolvedValue([mockEntity]);

            const result = await service.findArchived(mockHotelId);

            console.log(`[CATALOG / CANCELLATION] Récupération des archives ✅`);
            expect(mockRepo.find).toHaveBeenCalled();
            expect(result).toEqual([mockEntity]);
        });

        it('devrait retourner une règle par son ID', async () => {
            mockRepo.findOne.mockResolvedValue(mockEntity);

            const result = await service.findOne(mockHotelId, mockId);

            console.log(`[CATALOG / CANCELLATION] Récupération ID: ${mockId} ✅`);
            expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: mockId, hotelId: mockHotelId } });
            expect(result).toEqual(mockEntity);
        });

        it('devrait mettre à jour un modèle existant', async () => {
            const updateDto = { name: 'Updated Rule' } as any;
            const updatedEntity = { ...mockEntity, name: 'Updated Rule' };

            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.save.mockResolvedValue(updatedEntity);

            const result = await service.update(mockHotelId, mockId, updateDto);

            console.log(`[CATALOG / CANCELLATION] Mise à jour ID: ${mockId} ✅`);
            expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: mockId, hotelId: mockHotelId } });
            expect(mockRepo.save).toHaveBeenCalled();
            expect(result.name).toEqual('Updated Rule');
        });

        it('devrait supprimer une règle (Soft Delete)', async () => {
            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.softDelete.mockResolvedValue({ affected: 1 });

            await service.delete(mockHotelId, mockId);

            console.log(`[CATALOG / CANCELLATION] Suppression (Soft Delete) ID: ${mockId} ✅`);
            expect(mockRepo.softDelete).toHaveBeenCalledWith(mockId);
        });

        it('devrait restaurer une règle (Restore)', async () => {
            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.restore.mockResolvedValue({ affected: 1 });

            await service.restore(mockHotelId, mockId);

            console.log(`[CATALOG / CANCELLATION] Restauration ID: ${mockId} ✅`);
            expect(mockRepo.restore).toHaveBeenCalledWith(mockId);
        });
    });

    // =========================================================================
    // LES CAS D'ERREURS (EXCEPTIONS)
    // =========================================================================
    describe('Les Cas d\'Erreurs (Exceptions) ❌', () => {
        it('devrait lever une NotFoundException lors de la récupération si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / CANCELLATION] Tentative récupération invalide ❌ (Attendu)`);
            await expect(service.findOne(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la mise à jour si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / CANCELLATION] Tentative mise à jour invalide ❌ (Attendu)`);
            await expect(service.update(mockHotelId, 999, {} as any)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la suppression si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / CANCELLATION] Tentative suppression invalide ❌ (Attendu)`);
            await expect(service.delete(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la restauration si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / CANCELLATION] Tentative restauration invalide ❌ (Attendu)`);
            await expect(service.restore(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });
    });
});
