import { MenuSlotPayload } from '../interface/menu-selection.interface';

export class MenuSelectionResponseDto {
  id: number;
  menuPayload: MenuSlotPayload;
  selectedDate: string;
  historyId: number | null;
}
