import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
    private readonly frontendUrl: string;

    /* istanbul ignore next */
    constructor(private readonly configService: ConfigService) {
        this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    }

    sendUserInvitation(email: string, token: string): void {
        const link = `${this.frontendUrl}/accept-invite?token=${token}`;
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║              📧 INVITATION EMAIL (DEV)                  ║');
        console.log('╠══════════════════════════════════════════════════════════╣');
        console.log(`║  To:    ${email}`);
        console.log(`║  Link:  ${link}`);
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');
    }

    sendPasswordReset(email: string, token: string): void {
        const link = `${this.frontendUrl}/reset-password?token=${token}`;
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║           🔑 PASSWORD RESET EMAIL (DEV)                 ║');
        console.log('╠══════════════════════════════════════════════════════════╣');
        console.log(`║  To:    ${email}`);
        console.log(`║  Link:  ${link}`);
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');
    }
}
