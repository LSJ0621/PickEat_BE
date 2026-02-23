import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@/common/constants/error-codes';
import { MenuSelectionStatus } from '../entities/menu-selection.entity';

/**
 * Valid state transitions for MenuSelection status
 * Enforces state machine rules to prevent invalid transitions
 */
const VALID_TRANSITIONS: Record<MenuSelectionStatus, MenuSelectionStatus[]> = {
  [MenuSelectionStatus.PENDING]: [
    MenuSelectionStatus.PENDING,
    MenuSelectionStatus.BATCH_PROCESSING,
    MenuSelectionStatus.IN_PROGRESS,
    MenuSelectionStatus.CANCELLED,
  ],
  [MenuSelectionStatus.IN_PROGRESS]: [
    MenuSelectionStatus.SUCCEEDED,
    MenuSelectionStatus.FAILED,
    MenuSelectionStatus.CANCELLED,
  ],
  [MenuSelectionStatus.BATCH_PROCESSING]: [
    MenuSelectionStatus.SUCCEEDED,
    MenuSelectionStatus.FAILED,
  ],
  [MenuSelectionStatus.SUCCEEDED]: [],
  [MenuSelectionStatus.FAILED]: [
    MenuSelectionStatus.PENDING,
    MenuSelectionStatus.BATCH_PROCESSING,
    MenuSelectionStatus.PERMANENTLY_FAILED,
  ],
  [MenuSelectionStatus.CANCELLED]: [MenuSelectionStatus.PENDING],
  [MenuSelectionStatus.PERMANENTLY_FAILED]: [],
};

/**
 * Validate state transition and throw if invalid
 *
 * @param from - Current status
 * @param to - Target status
 * @throws BadRequestException if transition is invalid
 */
export function assertValidTransition(
  from: MenuSelectionStatus,
  to: MenuSelectionStatus,
): void {
  const validTargets = VALID_TRANSITIONS[from];
  if (!validTargets || !validTargets.includes(to)) {
    throw new BadRequestException(
      ErrorCode.MENU_SELECTION_INVALID_STATE_TRANSITION,
    );
  }
}
