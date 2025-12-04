import { MenuSlotPayload, SlotMenuInput } from './types/menu-selection.types';

export function normalizeMenuName(name: string | undefined | null): string {
  return (name ?? '').trim();
}

export function buildMenuPayloadFromSlotInputs(
  inputs: SlotMenuInput[],
): MenuSlotPayload {
  const payload: MenuSlotPayload = {
    breakfast: [],
    lunch: [],
    dinner: [],
    etc: [],
  };

  for (const item of inputs) {
    const normalized = normalizeMenuName(item.name);
    if (!normalized) continue;

    const slot = item.slot.toLowerCase();
    if (slot === 'breakfast') {
      if (!payload.breakfast.includes(normalized)) {
        payload.breakfast.push(normalized);
      }
    } else if (slot === 'lunch') {
      if (!payload.lunch.includes(normalized)) {
        payload.lunch.push(normalized);
      }
    } else if (slot === 'dinner') {
      if (!payload.dinner.includes(normalized)) {
        payload.dinner.push(normalized);
      }
    } else if (slot === 'etc') {
      if (!payload.etc.includes(normalized)) {
        payload.etc.push(normalized);
      }
    }
  }

  return payload;
}

export function mergeMenuPayload(
  existing: MenuSlotPayload,
  incoming: MenuSlotPayload,
): MenuSlotPayload {
  return {
    breakfast: Array.from(
      new Set([...existing.breakfast, ...incoming.breakfast]),
    ),
    lunch: Array.from(new Set([...existing.lunch, ...incoming.lunch])),
    dinner: Array.from(new Set([...existing.dinner, ...incoming.dinner])),
    etc: Array.from(new Set([...existing.etc, ...incoming.etc])),
  };
}

/**
 * 기존 데이터 구조를 새 구조({ breakfast, lunch, dinner, etc })로 변환
 */
export function normalizeMenuPayload(payload: any): MenuSlotPayload {
  if (!payload) {
    return { breakfast: [], lunch: [], dinner: [], etc: [] };
  }

  // 새 구조인 경우 (slot별)
  if (
    Array.isArray(payload.breakfast) &&
    Array.isArray(payload.lunch) &&
    Array.isArray(payload.dinner) &&
    Array.isArray(payload.etc)
  ) {
    return {
      breakfast: payload.breakfast,
      lunch: payload.lunch,
      dinner: payload.dinner,
      etc: payload.etc,
    };
  }

  // 기존 구조({ names: string[] })인 경우 - 모두 etc로 이동
  if (Array.isArray(payload.names)) {
    return {
      breakfast: [],
      lunch: [],
      dinner: [],
      etc: payload.names,
    };
  }

  // 기존 구조({ name: string })인 경우 - etc로 이동
  if (typeof payload.name === 'string' && payload.name.trim()) {
    return {
      breakfast: [],
      lunch: [],
      dinner: [],
      etc: [payload.name.trim()],
    };
  }

  return { breakfast: [], lunch: [], dinner: [], etc: [] };
}
