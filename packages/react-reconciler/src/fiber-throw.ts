import { Wakeable } from 'shared/react-types';
import { FiberRootNode } from './fiber';
import { Lane, markRootPinged } from './fiber-lanes';
import { ensureRootIsScheduled, markRootUpdated } from './work-loop';
import { getSuspenseHandler } from './suspense-context';
import { ShouldCapture } from './fiber-flags';

export function throwException(root: FiberRootNode, value: any, lane: Lane) {
  // ErrorBoundary

  // thenable
  if (value !== null && typeof value === 'object' && typeof value.then === 'function') {
    const Wakeable: Wakeable<any> = value;
    const suspenseBoundary = getSuspenseHandler();
    if (suspenseBoundary) {
      suspenseBoundary.flags |= ShouldCapture;
    }
    attachPingListener(root, Wakeable, lane);
  }
}

function attachPingListener(root: FiberRootNode, wakeable: Wakeable<any>, lane: Lane) {
  let pingCache = root.pingCache;
  let threadIDs: Set<Lane> | undefined;

  if (pingCache === null) {
    threadIDs = new Set<Lane>();
    pingCache = root.pingCache = new WeakMap<Wakeable<any>, Set<Lane>>();
    pingCache.set(wakeable, threadIDs);
  } else {
    threadIDs = pingCache.get(wakeable);
    if (threadIDs === undefined) {
      threadIDs = new Set<Lane>();
      pingCache.set(wakeable, threadIDs);
    }
  }

  if (!threadIDs.has(lane)) {
    threadIDs.add(lane);

    function ping() {
      if (pingCache !== null) {
        pingCache.delete(wakeable);
      }
      markRootPinged(root, lane);
      markRootUpdated(root, lane);
      ensureRootIsScheduled(root);
    }

    wakeable.then(ping, ping);
  }
}
