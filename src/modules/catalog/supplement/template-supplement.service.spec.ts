import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TemplateSupplementService } from './template-supplement.service';
import { TemplateSupplement } from './entities/template-supplement.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { NotFoundException } from '@nestjs/common';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';

describe('TemplateSupplementService - Tests Unitaires 💵', () => {
    let service: TemplateSupplementService;

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
        hotel: { id: mockHotelId },
        name: 'Gala Dinner NYE',
    } as unknown as TemplateSupplement;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TemplateSupplementService,
                { provide: getRepositoryToken(TemplateSupplement), useValue: mockRepo },
                { provide: getRepositoryToken(Hotel), useValue: mockHotelRepo },
            ],
        }).compile();

        service = module.get<TemplateSupplementService>(TemplateSupplementService);
        jest.clearAllMocks();
    });

    describe('Le Happy Path (Succès) ✅', () => {
        it('devrait créer et retourner un modèle de Supplément', async () => {
            const createDto = { name: 'Gala Dinner NYE' } as any;
            mockHotelRepo.findOne.mockResolvedValue({ id: mockHotelId });
            mockRepo.create.mockReturnValue(mockEntity);
            mockRepo.save.mockResolvedValue(mockEntity);

            const result = await service.createTemplateSupplement(mockHotelId, createDto);

            console.log(`[CATALOG / SUPPLEMENT] Création réussie : ${result.name} ✅`);
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
            pageOptions.search = 'Gala';

            const result = await service.findAllTemplateSupplements(mockHotelId, pageOptions);

            console.log(`[CATALOG / SUPPLEMENT] Récupération de ${result.data.length} règle(s) ✅`);
            expect(result.data).toEqual([mockEntity]);
            expect(result.meta.total).toBe(1);
        });

        it('devrait retourner une liste paginée sans filtre de recherche', async () => {
            mockRepo.findAndCount.mockResolvedValue([[mockEntity], 1]);
            const pageOptions = new PageOptionsDto();
            pageOptions.page = 1;
            pageOptions.limit = 10;

            const result = await service.findAllTemplateSupplements(mockHotelId, pageOptions);

            expect(result.data).toEqual([mockEntity]);
            expect(result.meta.total).toBe(1);
        });

        it('devrait retourner les règles archivées', async () => {
            mockRepo.find.mockResolvedValue([mockEntity]);

            const result = await service.findArchivedTemplateSupplements(mockHotelId);

            console.log(`[CATALOG / SUPPLEMENT] Récupération des archives ✅`);
            expect(mockRepo.find).toHaveBeenCalled();
            expect(result).toEqual([mockEntity]);
        });

        it('devrait retourner une règle par son ID', async () => {
            mockRepo.findOne.mockResolvedValue(mockEntity);

            const result = await service.findOneTemplateSupplement(mockHotelId, mockId);

            console.log(`[CATALOG / SUPPLEMENT] Récupération ID: ${mockId} ✅`);
            expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: mockId, hotel: { id: mockHotelId } } });
            expect(result).toEqual(mockEntity);
        });

        it('devrait mettre à jour un modèle existant', async () => {
            const updateDto = { name: 'Gala Dinner XMAS' } as any;
            const updatedEntity = { ...mockEntity, name: 'Gala Dinner XMAS' };

            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.save.mockResolvedValue(updatedEntity);

            const result = await service.updateTemplateSupplement(mockHotelId, mockId, updateDto);

            console.log(`[CATALOG / SUPPLEMENT] Mise à jour ID: ${mockId} ✅`);
            expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: mockId, hotel: { id: mockHotelId } } });
            expect(mockRepo.save).toHaveBeenCalled();
            expect(result.name).toEqual('Gala Dinner XMAS');
        });

        it('devrait supprimer une règle (Soft Delete)', async () => {
            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.softDelete.mockResolvedValue({ affected: 1 });

            await service.removeTemplateSupplement(mockHotelId, mockId);

            console.log(`[CATALOG / SUPPLEMENT] Suppression (Soft Delete) ID: ${mockId} ✅`);
            expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: mockId, hotel: { id: mockHotelId } } });
            expect(mockRepo.softDelete).toHaveBeenCalledWith(mockId);
        });

        it('devrait restaurer une règle (Restore)', async () => {
            mockRepo.findOne.mockResolvedValue(mockEntity);
            mockRepo.restore.mockResolvedValue({ affected: 1 });

            await service.restoreTemplateSupplement(mockHotelId, mockId);

            console.log(`[CATALOG / SUPPLEMENT] Restauration ID: ${mockId} ✅`);
            expect(mockRepo.restore).toHaveBeenCalledWith(mockId);
        });
    });

    // =========================================================================
    // LES CAS D'ERREURS (EXCEPTIONS)
    // =========================================================================
    describe('Les Cas d\'Erreurs (Exceptions) ❌', () => {
        it('devrait lever une NotFoundException à la création si l\'hôtel est introuvable', async () => {
            mockHotelRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / SUPPLEMENT] Tentative création invalide ❌ (Attendu)`);
            await expect(service.createTemplateSupplement(999, {} as any)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la récupération si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / SUPPLEMENT] Tentative récupération invalide ❌ (Attendu)`);
            await expect(service.findOneTemplateSupplement(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la mise à jour si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / SUPPLEMENT] Tentative mise à jour invalide ❌ (Attendu)`);
            await expect(service.updateTemplateSupplement(mockHotelId, 999, {} as any)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la suppression si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / SUPPLEMENT] Tentative suppression invalide ❌ (Attendu)`);
            await expect(service.removeTemplateSupplement(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la restauration si introuvable', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            console.log(`[CATALOG / SUPPLEMENT] Tentative restauration invalide ❌ (Attendu)`);
            await expect(service.restoreTemplateSupplement(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });
    });
});
