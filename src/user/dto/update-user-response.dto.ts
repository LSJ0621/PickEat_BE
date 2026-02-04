export class UpdateUserResponseDto {
  name: string | null;
  birthYear: number | null;
  gender: 'male' | 'female' | 'other' | null;
}
