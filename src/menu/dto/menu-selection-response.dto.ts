import { MenuSlotPayload } from '../types/menu-selection.types';

export class MenuSelectionResponseDto {
  id: number;
  menuPayload: MenuSlotPayload;
  selectedDate: string;
  historyId: number | null;
}
