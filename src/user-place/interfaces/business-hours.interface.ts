export interface MenuItem {
  name: string;
  price: number;
}

export interface DayHours {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
  breakStart?: string; // "HH:MM"
  breakEnd?: string; // "HH:MM"
}

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface BusinessHours {
  isOpen247: boolean;
  is24Hours: boolean;
  days?: Partial<Record<DayOfWeek, DayHours>>;
}
