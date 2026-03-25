import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HotelService } from './hotel.service';
import { Hotel } from './entities/hotel.entity';
import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../../common/constants/enums';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';

describe('HotelService - Tests Unitaires 🏢', () => {
    let service: HotelService;

    // 1. Définition stricte des mocks du Repository TypeORM
    const mockHotelRepo = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        preload: jest.fn(),
        softDelete: jest.fn(),
        restore: jest.fn(),
    };

    // Objet fictif de référence pour les assertions
    const mockHotel = {
        id: 1,
        name: 'The Grand Budapest Hotel',
        email: 'contact@grandbudapest.com',
        phone: '+216 73 123 456',
        address: 'Zubrowka Republic',
        city: 'Nebelsbad',
        country: 'ZB',
        stars: 5,
        isActive: true,
        logo: 'logo.png',
        timezone: 'UTC',
        currency: 'EUR',
    } as unknown as Hotel;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                HotelService,
                {
                    provide: getRepositoryToken(Hotel),
                    useValue: mockHotelRepo, // Injection du faux repo
                },
            ],
        }).compile();

        service = module.get<HotelService>(HotelService);

        // Nettoyage de l'état des mocks avant chaque test
        jest.clearAllMocks();
    });

    // =========================================================================
    // LE HAPPY PATH
    // =========================================================================
    describe('Le Happy Path (Succès) ✅', () => {
        it('devrait créer et retourner un nouvel hôtel', async () => {
            const createDto: CreateHotelDto = {
                name: 'The Grand Budapest Hotel',
                emails: [{ label: 'Main', address: 'contact@grandbudapest.com' }],
                phone: '+216 73 123 456',
                address: 'Zubrowka Republic',
                legalRepresentative: 'M. Gustave',
                stars: 5,
                defaultCurrency: 'EUR',
            };

            // Setup comportement des mocks
            mockHotelRepo.create.mockReturnValue(mockHotel);
            mockHotelRepo.save.mockResolvedValue(mockHotel);

            // Exécution
            const result = await service.createHotel(createDto);

            // Assertions
            console.log(`[HÔTEL] Création réussie : ${result.name} ✅`);
            expect(mockHotelRepo.create).toHaveBeenCalledWith(createDto);
            expect(mockHotelRepo.save).toHaveBeenCalledWith(mockHotel);
            expect(result).toEqual(mockHotel);
        });

        it('devrait retourner tous les hôtels (Admin sans filtre utilisateur)', async () => {
            mockHotelRepo.find.mockResolvedValue([mockHotel]);

            const result = await service.findAllHotels();

            console.log(`[HÔTEL] Liste globale récupérée (${result.length} éléments) ✅`);
            expect(mockHotelRepo.find).toHaveBeenCalledWith(); // Appelé sans arguments
            expect(result).toEqual([mockHotel]);
        });

        it('devrait filtrer les hôtels pour un utilisateur spécifique (Commercial)', async () => {
            mockHotelRepo.find.mockResolvedValue([mockHotel]);
            const user = { id: 42, role: UserRole.COMMERCIAL };

            const result = await service.findAllHotels(user);

            console.log(`[HÔTEL] Recherche filtrée pour le commercial ID: ${user.id} ✅`);
            expect(mockHotelRepo.find).toHaveBeenCalledWith({
                where: { users: { id: user.id } },
                relations: ['users'],
            });
            expect(result).toEqual([mockHotel]);
        });

        it('devrait retourner tous les hôtels pour un utilisateur (Admin)', async () => {
            mockHotelRepo.find.mockResolvedValue([mockHotel]);
            const user = { id: 1, role: UserRole.ADMIN };

            const result = await service.findAllHotels(user);

            expect(mockHotelRepo.find).toHaveBeenCalledWith();
            expect(result).toEqual([mockHotel]);
        });

        it('devrait retourner les hôtels archivés', async () => {
            mockHotelRepo.find.mockResolvedValue([mockHotel]);

            const result = await service.findArchivedHotels();

            expect(mockHotelRepo.find).toHaveBeenCalled();
            expect(result).toEqual([mockHotel]);
        });

        it('devrait mettre à jour un hôtel existant par son ID', async () => {
            const updateDto: UpdateHotelDto = { name: 'The Grand Budapest - Renovated' };
            const updatedHotel = { ...mockHotel, ...updateDto };

            mockHotelRepo.preload.mockResolvedValue(updatedHotel);
            mockHotelRepo.save.mockResolvedValue(updatedHotel);

            const result = await service.updateHotel(1, updateDto);

            console.log(`[HÔTEL] Mise à jour ID: 1 ✅`);
            expect(mockHotelRepo.preload).toHaveBeenCalledWith({ id: 1, ...updateDto });
            expect(mockHotelRepo.save).toHaveBeenCalledWith(updatedHotel);
            expect(result.name).toBe('The Grand Budapest - Renovated');
        });

        it('devrait archiver (soft-delete) un hôtel', async () => {
            mockHotelRepo.softDelete.mockResolvedValue({ affected: 1 });

            await service.removeHotel(1);

            console.log(`[HÔTEL] Archivage soft-delete ID: 1 ✅`);
            expect(mockHotelRepo.softDelete).toHaveBeenCalledWith(1);
        });

        it('devrait restaurer un hôtel préalablement archivé', async () => {
            mockHotelRepo.restore.mockResolvedValue({ affected: 1 });

            await service.restoreHotel(1);

            console.log(`[HÔTEL] Restauration depuis l'archive ID: 1 ✅`);
            expect(mockHotelRepo.restore).toHaveBeenCalledWith(1);
        });
    });

    // =========================================================================
    // LES CAS D'ERREURS
    // =========================================================================
    describe('Les Cas d\'Erreurs (Exceptions) ❌', () => {
        it('devrait lever une NotFoundException lors de la mise à jour d\'un hôtel inexistant', async () => {
            // Le preload d'un ID manquant renvoie undefined
            mockHotelRepo.preload.mockResolvedValue(undefined);

            console.log(`[HÔTEL] Tentative màj avec ID invalide (999) ❌ (NotFoundException Attendue)`);
            await expect(service.updateHotel(999, { name: 'Ghost Hotel' })).rejects.toThrow(
                NotFoundException,
            );
        });

        it('devrait lever une NotFoundException lors du soft-delete d\'un hôtel inexistant', async () => {
            // La DB renvoie un affected de 0 car l'ID n'existe pas
            mockHotelRepo.softDelete.mockResolvedValue({ affected: 0 });

            console.log(`[HÔTEL] Tentative suppression avec ID invalide (999) ❌ (NotFoundException Attendue)`);
            await expect(service.removeHotel(999)).rejects.toThrow(NotFoundException);
        });

        it('devrait lever une NotFoundException lors de la restauration d\'un hôtel inexistant', async () => {
            // La DB renvoie un affected de 0
            mockHotelRepo.restore.mockResolvedValue({ affected: 0 });

            console.log(`[HÔTEL] Tentative restauration avec ID invalide (999) ❌ (NotFoundException Attendue)`);
            await expect(service.restoreHotel(999)).rejects.toThrow(NotFoundException);
        });
    });
});
