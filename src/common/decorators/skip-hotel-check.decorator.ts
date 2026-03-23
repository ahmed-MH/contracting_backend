import { SetMetadata } from '@nestjs/common';

export const SKIP_HOTEL_CHECK_KEY = 'skipHotelCheck';

/**
 * Marks a route as not requiring hotel-level access validation.
 * Use on routes like /auth/*, /users/me, etc. that are not hotel-scoped.
 */
export const SkipHotelCheck = () => SetMetadata(SKIP_HOTEL_CHECK_KEY, true);
