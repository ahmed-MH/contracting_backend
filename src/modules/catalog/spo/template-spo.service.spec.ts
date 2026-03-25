import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TemplateSpoService } from './template-spo.service';
import { TemplateSpo } from './entities/template-spo.entity';
import { NotFoundException } from '@nestjs/common';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { SpoBenefitType, SpoConditionType } from '../../../common/constants/enums';

describe('TemplateSpoService - Tests Unitaires 🎁', () => {
    let service: TemplateSpoService;

    // Mock strict TypeORM pour TemplateSpo
    const mockSpoRepo = {
        findAndCount: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        softDelete: jest.fn(),
        restore: jest.fn(),
    };

    const mockHotelId = 1;
    const mockSpoId = 100;

    const mockSpo = {
        id: mockSpoId,
        hotelId: mockHotelId,
        name: 'Stay 7 Pay 6',
        benefitType: SpoBenefitType.FREE_NIGHTS,
        conditionType: SpoConditionType.MIN_NIGHTS,
        stayNights: 7,
        payNights: 6,
    } as unknown as TemplateSpo;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TemplateSpoService,
                {
                    provide: getRepositoryToken(TemplateSpo),
                    useValue: mockSpoRepo,
                },
            ],
        }).compile();

        service = module.get<TemplateSpoService>(TemplateSpoService);
        jest.clearAllMocks();
    });

    // =========================================================================
    // LE HAPPY PATH
    // =========================================================================
    describe('Le Happy Path (Succès) ✅', () => {
        it('devrait créer et retourner un modèle SPO (Offre Spéciale)', async () => {
            const createDto = {
                name: 'Stay 7 Pay 6',
                benefitType: SpoBenefitType.FREE_NIGHTS,
                conditionType: SpoConditionType.MIN_NIGHTS,
                stayNights: 7,
                payNights: 6,
            } as any;

            mockSpoRepo.create.mockReturnValue(mockSpo);
            mockSpoRepo.save.mockResolvedValue(mockSpo);

            const result = await service.createTemplateSpo(mockHotelId, createDto);

            console.log(`[CATALOG / SPO] Création réussie : ${result.name} ✅`);
            expect(mockSpoRepo.create).toHaveBeenCalledWith({ ...createDto, hotelId: mockHotelId });
            expect(mockSpoRepo.save).toHaveBeenCalledWith(mockSpo);
            expect(result).toEqual(mockSpo);
        });

        it('devrait retourner une liste paginée avec recherche dynamique', async () => {
            mockSpoRepo.findAndCount.mockResolvedValue([[mockSpo], 1]);
            
            const pageOptions = new PageOptionsDto();
            pageOptions.page = 1;
            pageOptions.limit = 10;
            pageOptions.search = 'Stay 7'; // Test avec paramètre de recherche

            const result = await service.findAllTemplateSpos(mockHotelId, pageOptions);

            console.log(`[CATALOG / SPO] Récupération paginée de ${result.data.length} SPO(s) ✅`);
            expect(mockSpoRepo.findAndCount).toHaveBeenCalled();
            // L'assertion sur le contrat de retour permet de valider la PageDto (data, total...)
            expect(result.data).toEqual([mockSpo]);
            expect(result.meta.total).toBe(1);
        });

        it('devrait retourner une liste paginée sans filtre de recherche', async () => {
            mockSpoRepo.findAndCount.mockResolvedValue([[mockSpo], 1]);
            
            const pageOptions = new PageOptionsDto();
            pageOptions.page = 1;
            pageOptions.limit = 10;

            const result = await service.findAllTemplateSpos(mockHotelId, pageOptions);

            expect(mockSpoRepo.findAndCount).toHaveBeenCalled();
            expect(result.data).toEqual([mockSpo]);
            expect(result.meta.total).toBe(1);
        });

        it('devrait retourner les règles archivées', async () => {
            mockSpoRepo.find.mockResolvedValue([mockSpo]);

            const result = await service.findArchivedTemplateSpos(mockHotelId);

            console.log(`[CATALOG / SPO] Récupération des archives ✅`);
            expect(mockSpoRepo.find).toHaveBeenCalled();
            expect(result).toEqual([mockSpo]);
        });

        it('devrait mettre à jour un modèle existant', async () => {
            const updateDto = { name: 'Stay 14 Pay 12' } as any;
            const updatedSpo = { ...mockSpo, name: 'Stay 14 Pay 12' };

            // Le findOne doit retourner le mock initial avant assignation
            mockSpoRepo.findOne.mockResolvedValue(mockSpo);
            mockSpoRepo.save.mockResolvedValue(updatedSpo);

            const result = await service.updateTemplateSpo(mockHotelId, mockSpoId, updateDto);

            console.log(`[CATALOG / SPO] Mise à jour SPO ID: ${mockSpoId} ✅`);
            expect(mockSpoRepo.findOne).toHaveBeenCalledWith({ where: { id: mockSpoId, hotelId: mockHotelId } });
            // Le save teste l'impact de Object.assign() 
            expect(mockSpoRepo.save).toHaveBeenCalled();
            expect(result.name).toEqual('Stay 14 Pay 12');
        });

        it('devrait supprimer une SPO (Soft Delete)', async () => {
            mockSpoRepo.findOne.mockResolvedValue(mockSpo);
            mockSpoRepo.softDelete.mockResolvedValue({ affected: 1 });

            await service.removeTemplateSpo(mockHotelId, mockSpoId);

            console.log(`[CATALOG / SPO] Suppression (Soft Delete) ID: ${mockSpoId} ✅`);
            expect(mockSpoRepo.findOne).toHaveBeenCalledWith({ where: { id: mockSpoId, hotelId: mockHotelId } });
            expect(mockSpoRepo.softDelete).toHaveBeenCalledWith(mockSpoId);
        });

        it('devrait restaurer une règle (Restore)', async () => {
            mockSpoRepo.findOne.mockResolvedValue(mockSpo);
            mockSpoRepo.restore.mockResolvedValue({ affected: 1 });

            await service.restoreTemplateSpo(mockHotelId, mockSpoId);

            console.log(`[CATALOG / SPO] Restauration ID: ${mockSpoId} ✅`);
            expect(mockSpoRepo.restore).toHaveBeenCalledWith(mockSpoId);
        });
    });

    // =========================================================================
    // LES CAS D'ERREURS (EXCEPTIONS)
    // =========================================================================
    describe('Les Cas d\'Erreurs (Exceptions) ❌', () => {
        it('devrait lever une NotFoundException lors de la mise à jour si introuvable', async () => {
            mockSpoRepo.findOne.mockResolvedValue(null);

            console.log(`[CATALOG / SPO] Tentative mise à jour SPO invalide ❌ (Attendu)`);
            await expect(service.updateTemplateSpo(mockHotelId, 999, {} as any)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la suppression si introuvable', async () => {
            mockSpoRepo.findOne.mockResolvedValue(null);

            console.log(`[CATALOG / SPO] Tentative suppression SPO invalide ❌ (Attendu)`);
            await expect(service.removeTemplateSpo(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la restauration si introuvable', async () => {
            mockSpoRepo.findOne.mockResolvedValue(null);

            console.log(`[CATALOG / SPO] Tentative restauration SPO invalide ❌ (Attendu)`);
            await expect(service.restoreTemplateSpo(mockHotelId, 999)).rejects.toThrow(NotFoundException);
        });
    });
});
