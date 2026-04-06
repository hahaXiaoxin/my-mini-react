import { ReactContext } from 'shared/react-types';
import { FiberNode } from './fiber';
import { includeSomeLanes, isSubsetOfLanes, Lane, mergeLanes, NoLanes } from './fiber-lanes';
import { markWipReceivedUpdate } from './begin-work';
import { ContextProvider } from './work-tags';

let prevContextValue: any = null;

const prevContextValueStack: any[] = [];

let lastContextDependency: ContextItem<any> | null = null;

export interface ContextItem<Value> {
  context: ReactContext<Value>;
  memoizedValue: Value;
  next: ContextItem<Value> | null;
}

/** 多个相同的 provider 进入时要入栈 */
export function pushProvider<T>(context: ReactContext<T>, newValue: T) {
  prevContextValueStack.push(prevContextValue);
  prevContextValue = context._currentValue;
  context._currentValue = newValue;
}

/**
 * 多个相同的 provider 在离开时要出栈
 */
export function popProvider<T>(context: ReactContext<T>) {
  context._currentValue = prevContextValue;

  prevContextValue = prevContextValueStack.pop();
}

export function prepareToReadContext(wip: FiberNode, renderLane: Lane) {
  lastContextDependency = null;

  const deps = wip.dependencies;
  if (deps !== null) {
    const firstContext = deps.firstContext;
    if (firstContext !== null) {
      if (includeSomeLanes(deps.lanes, renderLane)) {
        // 有变化
        markWipReceivedUpdate();
      }
      deps.firstContext = null;
    }
  }
}

// #region useContext
export function readContext<T>(consumer: FiberNode | null, context: ReactContext<T>): T {
  if (consumer === null) {
    throw new Error('请在函数组件内调用 useContext');
  }

  const value = context._currentValue;

  // 建立 fiber -> context
  const contextItem: ContextItem<T> = {
    context,
    next: null,
    memoizedValue: value
  };

  if (lastContextDependency === null) {
    lastContextDependency = contextItem;
    consumer.dependencies = {
      firstContext: contextItem,
      lanes: NoLanes
    };
  } else {
    lastContextDependency = lastContextDependency.next = contextItem;
  }
  return value;
}
// #endregion

export function propagateContextChange<T>(wip: FiberNode, context: ReactContext<T>, renderLane: Lane) {
  let fiber = wip.child;

  if (fiber !== null) {
    fiber.return = wip;
  }

  while (fiber !== null) {
    let nextFiber = null;
    const deps = fiber.dependencies;
    if (deps !== null) {
      nextFiber = fiber.child;

      let contextItem = deps.firstContext;
      while (contextItem !== null) {
        if (contextItem.context === context) {
          // 找到了用到了当前 context 的地方
          fiber.lanes = mergeLanes(fiber.lanes, renderLane);
          const alternate = fiber.alternate;
          if (alternate !== null) {
            alternate.lanes = mergeLanes(alternate.lanes, renderLane);
          }

          scheduleContextWorkOnParentPath(fiber.return, wip, renderLane);
          deps.lanes = mergeLanes(deps.lanes, renderLane);
          break;
        }

        contextItem = contextItem.next;
      }
    } else if (fiber.tag === ContextProvider) {
      nextFiber = fiber.type === wip.type ? null : fiber.child;
    } else {
      nextFiber = fiber.child;
    }

    if (nextFiber !== null) {
      nextFiber.return = fiber;
    } else {
      nextFiber = fiber;
      while (nextFiber !== null) {
        if (nextFiber === wip) {
          nextFiber = null;
          break;
        }
        const sibling = nextFiber.sibling;
        if (sibling !== null) {
          sibling.return = nextFiber.return;
          nextFiber = sibling;
          break;
        }
        nextFiber = nextFiber.return;
      }
    }

    fiber = nextFiber;
  }
}

function scheduleContextWorkOnParentPath(from: FiberNode | null, to: FiberNode, renderLane: Lane) {
  let node = from;

  while (node !== null) {
    const alternate = node.alternate;

    if (!isSubsetOfLanes(node.childLanes, renderLane)) {
      node.childLanes = mergeLanes(node.childLanes, renderLane);
      if (alternate !== null) {
        alternate.childLanes = mergeLanes(alternate.childLanes, renderLane);
      }
    } else if (alternate !== null && !isSubsetOfLanes(alternate.childLanes, renderLane)) {
      alternate.childLanes = mergeLanes(alternate.childLanes, renderLane);
    }

    if (node === to) {
      break;
    }

    node = node.return;
  }
}
