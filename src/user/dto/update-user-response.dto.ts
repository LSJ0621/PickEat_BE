export class UpdateUserResponseDto {
  name: string | null;
  birthDate: string | null;
  gender: 'male' | 'female' | 'other' | null;
}
