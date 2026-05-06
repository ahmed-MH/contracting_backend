export interface AuditActor {
    userId: number | null;
    name: string | null;
    email: string | null;
}

export interface AuditableShape {
    createdAt: Date;
    updatedAt: Date;
    createdByUserId: number | null;
    createdByName: string | null;
    createdByEmail: string | null;
    updatedByUserId: number | null;
    updatedByName: string | null;
    updatedByEmail: string | null;
}
