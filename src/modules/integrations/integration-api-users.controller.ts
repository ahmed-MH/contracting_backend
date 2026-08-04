import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
} from '@nestjs/common';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';
import {
    CreateIntegrationApiUserDto,
    UpdateIntegrationApiUserDto,
} from './dto/integration-api-user.dto';
import { IntegrationApiUsersService } from './integration-api-users.service';

@Controller('integrations/api-users')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
export class IntegrationApiUsersController {
    constructor(private readonly apiUsersService: IntegrationApiUsersService) { }

    @Get()
    findAll(@CurrentUser() user: RequestUser) {
        return this.apiUsersService.findAll(user);
    }

    @Post()
    create(@Body() dto: CreateIntegrationApiUserDto, @CurrentUser() user: RequestUser) {
        return this.apiUsersService.create(dto, user);
    }

    @Patch(':id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateIntegrationApiUserDto,
        @CurrentUser() user: RequestUser,
    ) {
        return this.apiUsersService.update(id, dto, user);
    }
}
