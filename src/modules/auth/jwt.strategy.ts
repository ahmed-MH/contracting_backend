import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
    sub: number;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    role: string;
    hotelIds: number[];
    tenantId: number | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET') || 'fallback-secret',
        });
    }

    validate(payload: JwtPayload) {
        // Returned object is injected into request.user
        return {
            id: payload.sub,
            email: payload.email,
            firstName: payload.firstName ?? null,
            lastName: payload.lastName ?? null,
            displayName: payload.displayName ?? null,
            role: payload.role,
            hotelIds: payload.hotelIds || [],
            tenantId: payload.tenantId || null
        };
    }
}
