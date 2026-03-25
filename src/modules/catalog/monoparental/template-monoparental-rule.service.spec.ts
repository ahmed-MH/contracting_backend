import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TemplateMonoparentalRuleService } from './template-monoparental-rule.service';
import { TemplateMonoparentalRule } from './entities/template-monoparental-rule.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { NotFoundException } from '@nestjs/common';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';

describe('TemplateMonoparentalRuleService - Tests Unitaires 👨‍👦', () => {
    let service: TemplateMonoparentalRuleService;

    const mockRepo = {
        findAndCount: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        softDelete: jest.fn(),
        restore: jest.fn(),
    };

    const mockHotelRepo = {
        findOne: jest.fn(),
    };

    const mockHotelId = 1;
    const mockId = 100;

    const mockEntity = {
        id: mockId,
        hotelId: mockHotelId,
        name: 'Monoparental Standard',
    } as unknown as TemplateMonoparentalRule;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TemplateMonoparentalRuleService,
                { provide: getRepositoryToken(TemplateMonoparentalRule), useValue: mockRepo },
                { provide: getRepositoryToken(Hotel), useValue: mockHotelRepo },
            ],
        }).compile();

        service = module.get<TemplateMonoparentalRuleService>(TemplateMonoparentalRuleService);
        jest.clearAllMocks();
    });

    describe('Le Happy Path (Succès) ✅', () => {
        it('devrait créer et retourner un modèle Monoparental', async () => {
            const createDto = { name: 'Monoparental Standard' } as any;
            mockHotelRepo.findOne.mockResolvedValue({ id: mockHotelId });
            mockRepo.create.mockReturnValue(mockEntity);
            mockRepo.save.mockResolvedValue(mockEntity);

            const result = await service.createTemplateMonoparentalRule(mockHotelId, createDto);

            console.log(`[CATALOG / MONOPARENTAL] Création réussie : ${result.name} ✅`);
            expect(mockHotelRepo.findOne).toHaveBeenCalledWith({ where: { id: mockHotelId } });
            expect(mockRepo.create).toHaveBeenCalledWith({ ...createDto, hotel: { id: mockHotelId } });
            expect(mockRepo.save).toHaveBeenCalledWith(mockEntity);
            expect(result).toEqual(mockEntity);
        });

        it('devrait retourner une liste paginée avec recherche dynamique', async () => {
            mockRepo.findAndCount.mockResolvedValue([[mockEntity], 1]);
            const pageOptions = new PageOptionsDto();
            pageOptions.page = 1;
            pageOptions.limit = 10;
            pageOptions.search = 'Mono';

            const result = await service.findAllTemplateMonoparentalRules(mockHotelId, pageOptions);

            console.log(`[CATALOG / MONOPARENTAL] Récupération de ${result.data.length} règle(s) ✅`);
            expect(result.data).toEqual([mockEntity]);
            expect(result.meta.total).toBe(1);
        });

        it('devrait retourner une liste paginée sans filtre de recherche', async () => {
            mockRepo.findAndCount.mockResolvedValue([[mockEntity], 1]);
            const pageOptions = new PageOptionsDto();
            pageOptions.page = 1;
            pageOptions.limit = 10;

            const result = await service.findAllTemplateMonoparentalRules(mockHotelId, pageOptions);

            expect(result.data).toEqual([mockEntity]);
            expect(result.meta.total).toBe(1);
        });

        it('devrait retourner les règles archivées', async () => {
            mockRepo.find.mockResolvedValue([mockEntity]);

            const result = await service.findArchivedTemplateMonoparentalRules(mockHotelId);

            console.log(`[CATALOG / MONOPARENTAL] Récupération des archives ✅`);
            expect(mockRepo.find).toHaveBeenCalled();
            expect(result).toEqual([mockEntity]);
        });

        it('devrait mettre à jour un modèle existant', async () => {
            const updateDto = { name: 'Monoparental Premium' } as any;
            const updatedEntity = { ...mockEntity, name: 'Monoparental Premium' };

            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.save.mockResolvedValue(updatedEntity);

            const result = await service.updateTemplateMonoparentalRule(mockHotelId, mockId, updateDto);

            console.log(`[CATALOG / MONOPARENTAL] Mise à jour ID: ${mockId} ✅`);
            expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: mockId, hotelId: mockHotelId } });
            expect(mockRepo.save).toHaveBeenCalled();
            expect(result.name).toEqual('Monoparental Premium');
        });

        it('devrait supprimer une règle (Soft Delete)', async () => {
            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.softDelete.mockResolvedValue({ affected: 1 });

            await service.removeTemplateMonoparentalRule(mockHotelId, mockId);

            console.log(`[CATALOG / MONOPARENTAL] Suppression (Soft Delete) ID: ${mockId} ✅`);
            expect(mockRepo.softDelete).toHaveBeenCalledWith(mockId);
        });

        it('devrait restaurer une règle (Restore)', async () => {
            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.restore.mockResolvedValue({ affected: 1 });

            await service.restoreTemplateMonoparentalRule(mockHotelId, mockId);

            console.log(`[CATALOG / MONOPARENTAL] Restauration ID: ${mockId} ✅`);
            expect(mockRepo.restore).toHaveBeenCalledWith(mockId);
        });
    });

    // =========================================================================
    // LES CAS D'ERREURS (EXCEPTIONS)
    // =========================================================================
    describe('Les Cas d\'Erreurs (Exceptions) ❌', () => {
        it('devrait lever une NotFoundException à la création si l\'hôtel est introuvable', async () => {
            mockHotelRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / MONOPARENTAL] Tentative création invalide ❌ (Attendu)`);
            await expect(service.createTemplateMonoparentalRule(999, {} as any)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la mise à jour si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / MONOPARENTAL] Tentative mise à jour invalide ❌ (Attendu)`);
            await expect(service.updateTemplateMonoparentalRule(mockHotelId, 999, {} as any)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la suppression si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / MONOPARENTAL] Tentative suppression invalide ❌ (Attendu)`);
            await expect(service.removeTemplateMonoparentalRule(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la restauration si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / MONOPARENTAL] Tentative restauration invalide ❌ (Attendu)`);
            await expect(service.restoreTemplateMonoparentalRule(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });
    });
});
