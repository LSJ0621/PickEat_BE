import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthUserPayload,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guard/jwt.guard';
import { CreateUserAddressDto } from './dto/create-user-address.dto';
import { DeleteUserAddressesDto } from './dto/delete-user-addresses.dto';
import { SearchAddressDto } from './dto/search-address.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UpdateSingleAddressDto } from './dto/update-single-address.dto';
import { UpdateUserNameDto } from './dto/update-user-name.dto';
import { UpdateUserAddressDto } from './dto/update-user-address.dto';
import { UserAddressResponseDto } from './dto/user-address-response.dto';
import { UserAddress } from './entities/user-address.entity';
import { UserService } from './user.service';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('preferences')
  async getPreferences(@CurrentUser() authUser: AuthUserPayload) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const preferences = await this.userService.getEntityPreferences(entity);
    return { preferences };
  }

  @Post('preferences')
  async upsertPreferences(
    @Body() preferencesDto: UpdatePreferencesDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const preferences = await this.userService.updateEntityPreferences(
      entity,
      preferencesDto.likes,
      preferencesDto.dislikes,
    );
    return { preferences };
  }

  @Get('address/search')
  async searchAddress(@Query() searchDto: SearchAddressDto) {
    return this.userService.searchAddress(searchDto);
  }

  @Patch('address')
  async updateSingleAddress(
    @Body() updateDto: UpdateSingleAddressDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const updatedAddress = await this.userService.updateEntitySingleAddress(
      entity,
      updateDto.selectedAddress,
    );
    return this.toAddressResponseDto(updatedAddress);
  }

  @Patch()
  async updateUser(
    @Body() updateDto: UpdateUserNameDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const updated = await this.userService.updateEntityName(
      entity,
      updateDto.name,
    );
    return { name: updated.name };
  }

  @Delete('me')
  async deleteCurrentUser(@CurrentUser() authUser: AuthUserPayload) {
    await this.userService.deleteUser(authUser.email);
    return { message: '회원 탈퇴가 완료되었습니다.' };
  }

  // ========== 주소 리스트 관련 엔드포인트 ==========

  @Get('address/default')
  async getDefaultAddress(@CurrentUser() authUser: AuthUserPayload) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const address = await this.userService.getEntityDefaultAddress(entity);
    return address ? this.toAddressResponseDto(address) : null;
  }

  @Get('addresses')
  async getUserAddresses(@CurrentUser() authUser: AuthUserPayload) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const addresses = await this.userService.getEntityAddresses(entity);
    return addresses.map((addr) => this.toAddressResponseDto(addr));
  }

  @Post('addresses')
  async createUserAddress(
    @Body() dto: CreateUserAddressDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const address = await this.userService.createEntityAddress(entity, dto);
    return this.toAddressResponseDto(address);
  }

  @Patch('addresses/:id')
  async updateUserAddress(
    @Param('id') id: string,
    @Body() dto: UpdateUserAddressDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const addressId = parseInt(id, 10);
    const address = await this.userService.updateEntityAddress(
      entity,
      addressId,
      dto,
    );
    return this.toAddressResponseDto(address);
  }

  @Delete('addresses')
  async deleteUserAddresses(
    @Body() dto: DeleteUserAddressesDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    await this.userService.deleteEntityAddresses(entity, dto.ids);
    return { message: '주소가 삭제되었습니다.' };
  }

  @Patch('addresses/:id/default')
  async setDefaultAddress(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const addressId = parseInt(id, 10);
    const address = await this.userService.setEntityDefaultAddress(
      entity,
      addressId,
    );
    return this.toAddressResponseDto(address);
  }

  @Patch('addresses/:id/search')
  async setSearchAddress(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const addressId = parseInt(id, 10);
    const address = await this.userService.setEntitySearchAddress(
      entity,
      addressId,
    );
    return this.toAddressResponseDto(address);
  }

  // UserAddress 엔티티를 UserAddressResponseDto로 변환
  private toAddressResponseDto(address: UserAddress): UserAddressResponseDto {
    return {
      id: address.id,
      roadAddress: address.roadAddress,
      postalCode: address.postalCode,
      latitude:
        typeof address.latitude === 'string'
          ? parseFloat(address.latitude)
          : address.latitude,
      longitude:
        typeof address.longitude === 'string'
          ? parseFloat(address.longitude)
          : address.longitude,
      isDefault: address.isDefault,
      isSearchAddress: address.isSearchAddress,
      alias: address.alias,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
    };
  }
}
