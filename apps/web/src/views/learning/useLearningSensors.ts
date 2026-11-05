import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * Mouse needs a small move before a drag starts so a click on the handle stays a click. Touch
 * needs a short press-and-hold, otherwise every swipe that begins on a handle would be a drag and
 * page scrolling would break. Keyboard: focus the handle, Space to lift, arrows to move, Space to
 * drop.
 */
export const TOUCH_HOLD_MS = 200;

export function useLearningSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_HOLD_MS, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}
