import { Request } from 'express';
import { UserRole } from '../constants/enums';

export interface RequestUser {
    id: number;
    email: string;
    role: UserRole;
    hotelIds: number[];
    tenantId: number | null;
}

export interface AuthenticatedRequest extends Request {
    user?: RequestUser;
    headers: Record<string, string | string[] | undefined>;
    url: string;
    method: string;
    originalUrl: string;
}

export interface AuthenticatedResponse {
    status: (code: number) => this;
    json: (body: any) => this;
    statusCode: number;
}
