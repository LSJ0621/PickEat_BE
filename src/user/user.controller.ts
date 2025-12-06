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
import { UpdateUserAddressDto } from './dto/update-user-address.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserAddressResponseDto } from './dto/user-address-response.dto';
import { UserAddress } from './entities/user-address.entity';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @UseGuards(JwtAuthGuard)
  @Get('preferences')
  async getPreferences(@CurrentUser() authUser: AuthUserPayload) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      const preferences = await this.userService.getPreferences(
        result.user!.id,
      );
      return { preferences };
    } else {
      const preferences = await this.userService.getSocialLoginPreferences(
        result.socialLogin!.id,
      );
      return { preferences };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('preferences')
  async upsertPreferences(
    @Body() preferencesDto: UpdatePreferencesDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    const likes = preferencesDto.likes;
    const dislikes = preferencesDto.dislikes;
    if (result.type === 'user') {
      const preferences = await this.userService.updatePreferences(
        result.user!.id,
        likes,
        dislikes,
      );
      return { preferences };
    } else {
      const preferences = await this.userService.updateSocialLoginPreferences(
        result.socialLogin!.id,
        likes,
        dislikes,
      );
      return { preferences };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('address/search')
  async searchAddress(@Query() searchDto: SearchAddressDto) {
    return this.userService.searchAddress(searchDto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('address')
  async updateSingleAddress(
    @Body() updateDto: UpdateSingleAddressDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      const updatedUser = await this.userService.updateAddress(
        result.user!.id,
        updateDto.selectedAddress,
      );
      return { address: updatedUser.address };
    } else {
      const updatedSocialLogin =
        await this.userService.updateSocialLoginSingleAddress(
          result.socialLogin!.id,
          updateDto.selectedAddress,
        );
      return { address: updatedSocialLogin.address };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  async updateCurrentUser(
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      const updatedUser = await this.userService.update(
        result.user!.id,
        updateUserDto,
      );
      return {
        name: updatedUser.name,
      };
    } else {
      // SocialLogin의 경우 이름만 업데이트 가능
      if (updateUserDto.name !== undefined) {
        const updatedSocialLogin = await this.userService.updateSocialLoginName(
          result.socialLogin!.id,
          updateUserDto.name,
        );
        return {
          name: updatedSocialLogin.name,
          profileImage: updatedSocialLogin.profileImage,
        };
      }
      // profileImage는 SocialLogin에서 업데이트하지 않음 (소셜에서 제공)
      return {
        name: result.socialLogin!.name,
        profileImage: result.socialLogin!.profileImage,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  async deleteCurrentUser(@CurrentUser() authUser: AuthUserPayload) {
    await this.userService.deleteUser(authUser.email);
    return { message: '회원 탈퇴가 완료되었습니다.' };
  }

  // ========== 주소 리스트 관련 엔드포인트 ==========

  // 기본 주소 조회 (마이페이지용)
  @UseGuards(JwtAuthGuard)
  @Get('address/default')
  async getDefaultAddress(@CurrentUser() authUser: AuthUserPayload) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    let address: UserAddress | null;
    if (result.type === 'user') {
      address = await this.userService.getDefaultUserAddress(result.user!.id);
    } else {
      address = await this.userService.getDefaultSocialLoginAddress(
        result.socialLogin!.id,
      );
    }
    if (!address) {
      return null;
    }
    return this.toAddressResponseDto(address);
  }

  // 주소 리스트 조회
  @UseGuards(JwtAuthGuard)
  @Get('addresses')
  async getUserAddresses(@CurrentUser() authUser: AuthUserPayload) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    let addresses: UserAddress[];
    if (result.type === 'user') {
      addresses = await this.userService.getUserAddresses(result.user!.id);
    } else {
      addresses = await this.userService.getSocialLoginAddresses(
        result.socialLogin!.id,
      );
    }
    return addresses.map((addr) => this.toAddressResponseDto(addr));
  }

  // 주소 추가 (마이페이지에서 하나씩 추가)
  @UseGuards(JwtAuthGuard)
  @Post('addresses')
  async createUserAddress(
    @Body() dto: CreateUserAddressDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    let address: UserAddress;
    if (result.type === 'user') {
      address = await this.userService.createUserAddress(
        result.user!.id,
        dto,
      );
    } else {
      address = await this.userService.createSocialLoginAddress(
        result.socialLogin!.id,
        dto,
      );
    }
    return this.toAddressResponseDto(address);
  }

  // 주소 수정
  @UseGuards(JwtAuthGuard)
  @Patch('addresses/:id')
  async updateUserAddress(
    @Param('id') id: string,
    @Body() dto: UpdateUserAddressDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    const addressId = parseInt(id, 10);
    let address: UserAddress;
    if (result.type === 'user') {
      address = await this.userService.updateUserAddress(
        addressId,
        result.user!.id,
        dto,
      );
    } else {
      address = await this.userService.updateSocialLoginAddress(
        addressId,
        result.socialLogin!.id,
        dto,
      );
    }
    return this.toAddressResponseDto(address);
  }

  // 주소 삭제 (마이페이지용, 1~3개 선택 삭제 가능)
  @UseGuards(JwtAuthGuard)
  @Delete('addresses')
  async deleteUserAddresses(
    @Body() dto: DeleteUserAddressesDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      await this.userService.deleteUserAddresses(
        dto.ids,
        result.user!.id,
      );
    } else {
      await this.userService.deleteSocialLoginAddresses(
        dto.ids,
        result.socialLogin!.id,
      );
    }
    return { message: '주소가 삭제되었습니다.' };
  }

  // 기본 주소 설정 (마이페이지 표시용)
  @UseGuards(JwtAuthGuard)
  @Patch('addresses/:id/default')
  async setDefaultAddress(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    const addressId = parseInt(id, 10);
    let address: UserAddress;
    if (result.type === 'user') {
      address = await this.userService.setDefaultUserAddress(
        addressId,
        result.user!.id,
      );
    } else {
      address = await this.userService.setDefaultSocialLoginAddress(
        addressId,
        result.socialLogin!.id,
      );
    }
    return this.toAddressResponseDto(address);
  }

  // 검색 주소 설정 (메뉴 추천/검색 시 사용)
  @UseGuards(JwtAuthGuard)
  @Patch('addresses/:id/search')
  async setSearchAddress(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    const addressId = parseInt(id, 10);
    let address: UserAddress;
    if (result.type === 'user') {
      address = await this.userService.setSearchUserAddress(
        addressId,
        result.user!.id,
      );
    } else {
      address = await this.userService.setSearchSocialLoginAddress(
        addressId,
        result.socialLogin!.id,
      );
    }
    return this.toAddressResponseDto(address);
  }

  // UserAddress 엔티티를 UserAddressResponseDto로 변환
  private toAddressResponseDto(address: UserAddress): UserAddressResponseDto {
    return {
      id: address.id,
      roadAddress: address.roadAddress,
      postalCode: address.postalCode,
      latitude: typeof address.latitude === 'string' 
        ? parseFloat(address.latitude) 
        : address.latitude,
      longitude: typeof address.longitude === 'string' 
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
