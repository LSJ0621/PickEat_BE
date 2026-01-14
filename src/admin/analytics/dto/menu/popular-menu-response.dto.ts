export class PopularMenuItem {
  menu: string;
  count: number;
  rate?: number; // 선택률 (selected type일 때)
}

export class PopularMenuResponseDto {
  data: PopularMenuItem[];
}
