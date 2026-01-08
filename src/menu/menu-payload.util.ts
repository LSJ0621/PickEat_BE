import {
  MenuSlotPayload,
  SlotMenuInput,
} from './interface/menu-selection.interface';

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
export function normalizeMenuPayload(payload: unknown): MenuSlotPayload {
  if (!payload || typeof payload !== 'object') {
    return { breakfast: [], lunch: [], dinner: [], etc: [] };
  }

  const payloadObj = payload as Record<string, unknown>;

  // 새 구조인 경우 (slot별)
  if (
    Array.isArray(payloadObj.breakfast) &&
    Array.isArray(payloadObj.lunch) &&
    Array.isArray(payloadObj.dinner) &&
    Array.isArray(payloadObj.etc)
  ) {
    return {
      breakfast: payloadObj.breakfast,
      lunch: payloadObj.lunch,
      dinner: payloadObj.dinner,
      etc: payloadObj.etc,
    };
  }

  // 기존 구조({ names: string[] })인 경우 - 모두 etc로 이동
  if (Array.isArray(payloadObj.names)) {
    return {
      breakfast: [],
      lunch: [],
      dinner: [],
      etc: payloadObj.names,
    };
  }

  // 기존 구조({ name: string })인 경우 - etc로 이동
  if (typeof payloadObj.name === 'string' && payloadObj.name.trim()) {
    return {
      breakfast: [],
      lunch: [],
      dinner: [],
      etc: [payloadObj.name.trim()],
    };
  }

  return { breakfast: [], lunch: [], dinner: [], etc: [] };
}
