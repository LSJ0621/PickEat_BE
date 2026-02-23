import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  AuthUserPayload,
  CurrentUser,
} from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { MessageCode } from '@/common/constants/message-codes';
import { USER_PLACE } from '@/common/constants/business.constants';
import { MULTER_OPTIONS } from '@/common/config/multer.config';
import { ImageValidationPipe } from '@/common/pipes/file-validation.pipe';
import { UserService } from '@/user/user.service';
import { CreateUserPlaceDto } from './dto/create-user-place.dto';
import { UpdateUserPlaceDto } from './dto/update-user-place.dto';
import { UserPlaceListQueryDto } from './dto/user-place-list-query.dto';
import { CheckRegistrationDto } from './dto/check-registration.dto';
import { UserPlaceService } from './user-place.service';

@Controller('user-places')
@UseGuards(JwtAuthGuard)
export class UserPlaceController {
  constructor(
    private readonly userPlaceService: UserPlaceService,
    private readonly userService: UserService,
  ) {}

  /**
   * Check if user can register a new place
   */
  @Post('check')
  @Throttle({
    default: {
      limit: USER_PLACE.RATE_LIMITS.READ_PER_MINUTE,
      ttl: 60000,
    },
  })
  async checkRegistration(
    @Body() dto: CheckRegistrationDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    return this.userPlaceService.checkRegistration(user.id, dto);
  }

  /**
   * Create a new user place
   */
  @Post()
  @UseInterceptors(FilesInterceptor('images', 5, MULTER_OPTIONS))
  @Throttle({
    default: {
      limit: USER_PLACE.RATE_LIMITS.CREATE_PER_MINUTE,
      ttl: 60000,
    },
  })
  async create(
    @Body() dto: CreateUserPlaceDto,
    @UploadedFiles(new ImageValidationPipe()) files: Express.Multer.File[],
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    const place = await this.userPlaceService.create(user.id, dto, files ?? []);
    return {
      ...place,
      messageCode: MessageCode.USER_PLACE_CREATED,
    };
  }

  /**
   * Get user's place list
   */
  @Get()
  @Throttle({
    default: {
      limit: USER_PLACE.RATE_LIMITS.READ_PER_MINUTE,
      ttl: 60000,
    },
  })
  async findAll(
    @Query() query: UserPlaceListQueryDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    return this.userPlaceService.findAll(user.id, query);
  }

  /**
   * Get single user place
   */
  @Get(':id')
  @Throttle({
    default: {
      limit: USER_PLACE.RATE_LIMITS.READ_PER_MINUTE,
      ttl: 60000,
    },
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    return this.userPlaceService.findOne(user.id, id);
  }

  /**
   * Update user place
   */
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('images', 5, MULTER_OPTIONS))
  @Throttle({
    default: {
      limit: USER_PLACE.RATE_LIMITS.UPDATE_DELETE_PER_MINUTE,
      ttl: 60000,
    },
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserPlaceDto,
    @UploadedFiles(new ImageValidationPipe()) files: Express.Multer.File[],
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    const place = await this.userPlaceService.update(
      user.id,
      id,
      dto,
      files ?? [],
    );
    return {
      ...place,
      messageCode: MessageCode.USER_PLACE_UPDATED,
    };
  }

  /**
   * Delete user place
   */
  @Delete(':id')
  @Throttle({
    default: {
      limit: USER_PLACE.RATE_LIMITS.UPDATE_DELETE_PER_MINUTE,
      ttl: 60000,
    },
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    await this.userPlaceService.remove(user.id, id);
    return {
      messageCode: MessageCode.USER_PLACE_DELETED,
    };
  }
}
