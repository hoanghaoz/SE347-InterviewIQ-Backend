import { CheatEventType } from '../../../../generated/prisma/enums';
import { CommonCheatEventType } from '../domain/enums/interview-enum';

const eventTypeToPrisma: Record<CommonCheatEventType, CheatEventType> = {
  [CommonCheatEventType.TAB_SWITCH]: CheatEventType.TAB_SWITCH,
  [CommonCheatEventType.WINDOW_BLUR]: CheatEventType.WINDOW_BLUR,
  [CommonCheatEventType.FACE_MISSING]: CheatEventType.FACE_MISSING,
  [CommonCheatEventType.MULTIPLE_FACES]: CheatEventType.MULTIPLE_FACES,
};

const eventTypeToDomain: Record<CheatEventType, CommonCheatEventType> = {
  [CheatEventType.TAB_SWITCH]: CommonCheatEventType.TAB_SWITCH,
  [CheatEventType.WINDOW_BLUR]: CommonCheatEventType.WINDOW_BLUR,
  [CheatEventType.FACE_MISSING]: CommonCheatEventType.FACE_MISSING,
  [CheatEventType.MULTIPLE_FACES]: CommonCheatEventType.MULTIPLE_FACES,
};

export function mapCheatEventTypeToPrisma(
  eventType: CommonCheatEventType,
): CheatEventType {
  return eventTypeToPrisma[eventType];
}

export function mapCheatEventTypeToDomain(
  eventType: CheatEventType,
): CommonCheatEventType {
  return eventTypeToDomain[eventType];
}
