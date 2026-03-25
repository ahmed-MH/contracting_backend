import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { ConfigService } from '@nestjs/config';

describe('MailService', () => {
    let service: MailService;
    let consoleSpy: jest.SpyInstance;

    const mockConfigService = {
        get: jest.fn((key: string) => {
            if (key === 'FRONTEND_URL') return 'http://mock-frontend.com';
            return null;
        }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MailService,
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        service = module.get<MailService>(MailService);
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should fall back to localhost if FRONTEND_URL is not set', async () => {
        mockConfigService.get.mockReturnValueOnce(null);
        
        const module = await Test.createTestingModule({
            providers: [
                MailService,
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        const localService = module.get<MailService>(MailService);
        localService.sendUserInvitation('test@test.com', 'token-123');
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('http://localhost:5173/accept-invite?token=token-123'));
    });

    describe('sendUserInvitation', () => {
        it('should log invitation details to the console', () => {
            service.sendUserInvitation('test@example.com', '123-token');
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('test@example.com'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('http://mock-frontend.com/accept-invite?token=123-token'));
        });
    });

    describe('sendPasswordReset', () => {
        it('should log password reset details to the console', () => {
            service.sendPasswordReset('reset@example.com', 'reset-token-456');
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('reset@example.com'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('http://mock-frontend.com/reset-password?token=reset-token-456'));
        });
    });
});
