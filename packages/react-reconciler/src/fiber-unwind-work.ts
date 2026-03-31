import { popSuspenseHandler } from './suspense-context';
import { ContextProvider, SuspenseComponent } from './work-tags';
import { DidCapture, NoFlags, ShouldCapture } from './fiber-flags';
import { FiberNode } from './fiber';
import { popProvider } from './fiber-context';

export function unwindWork(wip: FiberNode) {
  const flags = wip.flags;

  switch (wip.tag) {
    case SuspenseComponent:
      popSuspenseHandler();
      if ((flags & ShouldCapture) !== NoFlags && (flags & DidCapture) === NoFlags) {
        wip.flags = (flags & ~ShouldCapture) | DidCapture;
        return wip;
      }
      return null;
    case ContextProvider: {
      const context = wip.type._context;
      popProvider(context);
      return null;
    }
    default:
      return null;
  }
}
