import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import {
  AuthUserPayload,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guard/jwt.guard';
import { SearchAddressDto } from './dto/search-address.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UpdateUserAddressDto } from './dto/update-user-address.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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
  async updateUserAddress(
    @Body() updateDto: UpdateUserAddressDto,
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
        await this.userService.updateSocialLoginAddress(
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
}
