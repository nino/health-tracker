import { createContext, useContext } from "react";

// Lets a gesture inside a sheet switch the sheet's ScrollView off while it
// runs. Needed for the chart pinch on iOS with the new architecture: the
// native scroll view only leaves touches alone when an *ancestor* of the
// scroll view is the JS responder (see `_shouldDisableScrollInteraction`
// in RCTScrollViewComponentView.mm) — a child claiming the responder, as
// the chart does, does not stop it from cancelling the touches the moment
// its own pan recognizer starts. Every real pinch has enough vertical
// movement to start it, so the pinch died before its first move reached
// JS. Disabling scrolling for the gesture's duration is the one lever the
// child has.
export const ScrollLockContext = createContext<(locked: boolean) => void>(
  () => {},
);

export function useScrollLock() {
  return useContext(ScrollLockContext);
}
