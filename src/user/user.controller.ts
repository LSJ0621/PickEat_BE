import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  AuthUserPayload,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guard/jwt.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @UseGuards(JwtAuthGuard)
  @Get('preferences')
  async getPreferences(@CurrentUser() authUser: AuthUserPayload) {
    const user = await this.userService.getOrFailByEmail(authUser.email);
    const preferences = await this.userService.getPreferences(user.id);
    return { preferences };
  }

  @UseGuards(JwtAuthGuard)
  @Post('preferences')
  async upsertPreferences(
    @Body() preferencesDto: UpdatePreferencesDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getOrFailByEmail(authUser.email);
    const tags = preferencesDto.tags ?? [];
    const preferences = await this.userService.updatePreferences(user.id, tags);
    return { preferences };
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(+id);
  }
}
