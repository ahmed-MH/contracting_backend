import { IsEmail, IsIn, IsArray, IsOptional, IsInt } from 'class-validator';
import { UserRole } from '../../../common/constants/enums';

export const TENANT_INVITE_ROLES = [UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT] as const;
export type TenantInviteRole = (typeof TENANT_INVITE_ROLES)[number];

export class InviteUserDto {
    @IsEmail()
    email: string;

    @IsIn(TENANT_INVITE_ROLES)
    role: TenantInviteRole;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    hotelIds?: number[];
}
