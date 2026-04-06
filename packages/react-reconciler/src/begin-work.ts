import { ReactElement } from 'shared/react-types';
import { createFiberFromFragment, createFiberFromOffscreen, createWorkInProgress, FiberNode, OffscreenProps } from './fiber';
import { processUpdateQueue, UpdateQueue } from './update-queue';
import {
  ContextProvider,
  Fragment,
  FunctionComponent,
  HostComponent,
  HostRoot,
  HostText,
  MemoComponent,
  OffscreenComponent,
  SuspenseComponent
} from './work-tags';
import { cloneChildFibers, mountChildFibers, reconcileChildFibers } from './child-fibers';
import { bailoutHook, renderWithHook } from './fiber-hooks';
import { includeSomeLanes, Lane, NoLanes } from './fiber-lanes';
import { ChildDeletion, DidCapture, NoFlags, Placement, Ref } from './fiber-flags';
import { prepareToReadContext, propagateContextChange, pushProvider } from './fiber-context';
import { pushSuspenseHandler } from './suspense-context';
import { shallowEqual } from 'shared/shallow-equal';

// 是否能命中 bailout
let didReceiveUpdate = false;

export function markWipReceivedUpdate() {
  didReceiveUpdate = true;
}

// 递归中的“递”
export const beginWork = (wip: FiberNode, renderLane: Lane) => {
  // bailout 策略
  didReceiveUpdate = false;
  const current = wip.alternate;

  if (current !== null) {
    const oldProps = current.memoizedProps;
    const newProps = wip.pendingProps;

    if (oldProps !== newProps || current.type !== wip.type) {
      didReceiveUpdate = true;
    } else {
      // state context
      const hasScheduledStateOrContext = checkScheduleUpdateOrContext(current, renderLane);
      if (!hasScheduledStateOrContext) {
        // 如果 current 中没有当前 renderLane 的队列，说明 state、context 没有更新，命中 bailout
        didReceiveUpdate = false;

        switch (wip.tag) {
          case ContextProvider: {
            const newValue = wip.memoizedProps.value;
            const context = wip.type._context;
            pushProvider(context, newValue);
            break;
          }
          // TODO Suspense
        }

        return bailoutOnAlreadyFinishedWork(wip, renderLane);
      }
    }
  }

  // "先清空，再重新收集"模式：
  // 进入 beginWork 意味着该 fiber 即将被处理，先乐观地假设所有 update 都会被消费（清空 lanes）。
  // 在后续 processUpdateQueue 消费 update 时，如果某个 update 因优先级不足被跳过，
  // 会通过 onSkipUpdate 回调将被跳过的 lane 重新 mergeLanes 回 fiber.lanes。
  // 这样 beginWork 结束后，fiber.lanes 就精确地反映了"还有哪些未完成的更新需要后续处理"。
  // 如果不清空，mergeLanes 只能做加法（按位或），无法表达"某个 lane 已经被消费"的语义，会导致重复调度。
  wip.lanes = NoLanes;

  // 比较，返回子 fiberNode
  switch (wip.tag) {
    case HostRoot:
      return updateHostRoot(wip, renderLane);
    // text 节点不需要处理
    case HostText:
      return null;
    case HostComponent:
      return updateHostComponent(wip, renderLane);
    case FunctionComponent:
      return updateFunctionComponent(wip, wip.type, renderLane);
    case Fragment:
      return updateFragment(wip);
    case ContextProvider:
      return updateContextProvider(wip, renderLane);
    case SuspenseComponent:
      return updateSuspenseComponent(wip);
    case OffscreenComponent:
      return updateOffscreenComponent(wip);
    case MemoComponent:
      return updateMemoComponent(wip, renderLane);
    default:
      if (__DEV__) {
        console.warn('beginWork 未实现的类型');
      }
      break;
  }
};

function updateMemoComponent(wip: FiberNode, renderLane: Lane) {
  // bailout 四要素
  // props 浅比较
  const current = wip.alternate;
  const nextProps = wip.pendingProps;
  const Component = wip.type.type;

  if (current !== null) {
    const prevProps = current.memoizedProps;

    // 浅比较 props
    if (shallowEqual(prevProps, nextProps) && current.ref === wip.ref) {
      didReceiveUpdate = false;
      wip.pendingProps = prevProps;

      if (!checkScheduleUpdateOrContext(current, renderLane)) {
        // 满足四要素
        wip.lanes = current.lanes;
        return bailoutOnAlreadyFinishedWork(wip, renderLane);
      }
    }
  }

  return updateFunctionComponent(wip, Component, renderLane);
}

function updateSuspenseComponent(wip: FiberNode) {
  const current = wip.alternate;
  const nextProps = wip.pendingProps;

  let showFallback = false;
  const didSuspend = (wip.flags & DidCapture) !== NoFlags;

  if (didSuspend) {
    showFallback = true;
    wip.flags &= ~DidCapture;
  }

  const nextPrimaryChildren = nextProps.children;
  const nextFallbackChildren = nextProps.fallback;
  pushSuspenseHandler(wip);

  if (current === null) {
    // mount
    if (showFallback) {
      // 挂起
      return mountSuspenseFallbackChildren(wip, nextPrimaryChildren, nextFallbackChildren);
    } else {
      // 正常
      return mountSuspensePrimaryChildren(wip, nextPrimaryChildren);
    }
  } else {
    // update
    if (showFallback) {
      // 挂起
      return updateSuspenseFallbackChildren(wip, nextPrimaryChildren, nextFallbackChildren);
    } else {
      // 正常
      return updateSuspensePrimaryChildren(wip, nextPrimaryChildren);
    }
  }
}

function updateSuspensePrimaryChildren(wip: FiberNode, primaryChildren: any) {
  const current = wip.alternate!;
  const currentPrimaryChildFragment = current.child!;
  const currentFallbackChildFragment: FiberNode | null = currentPrimaryChildFragment.sibling;

  const primaryChildrenProps: OffscreenProps = {
    mode: 'visible',
    children: primaryChildren
  };

  const primaryChildFragment = createWorkInProgress(currentPrimaryChildFragment, primaryChildrenProps);
  primaryChildFragment.return = wip;
  primaryChildFragment.sibling = null;
  wip.child = primaryChildFragment;

  if (currentFallbackChildFragment !== null) {
    const deletions = wip.deletions;
    if (deletions === null) {
      wip.deletions = [currentFallbackChildFragment];
      wip.flags |= ChildDeletion;
    } else {
      deletions.push(currentFallbackChildFragment);
    }
  }

  return primaryChildFragment;
}

function updateSuspenseFallbackChildren(wip: FiberNode, primaryChildren: any, fallbackChildren: any) {
  const current = wip.alternate!;
  const currentPrimaryChildFragment = current.child!;
  const currentFallbackChildFragment: FiberNode | null = currentPrimaryChildFragment.sibling;

  const primaryChildrenProps: OffscreenProps = {
    mode: 'hidden',
    children: primaryChildren
  };

  const primaryChildFragment = createWorkInProgress(currentPrimaryChildFragment, primaryChildrenProps);
  let fallbackChildFragment;

  if (currentFallbackChildFragment !== null) {
    fallbackChildFragment = createWorkInProgress(currentFallbackChildFragment, fallbackChildren);
  } else {
    fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);
    fallbackChildFragment.flags |= Placement;
  }

  fallbackChildFragment.return = wip;
  primaryChildFragment.return = wip;
  primaryChildFragment.sibling = fallbackChildFragment;
  wip.child = primaryChildFragment;

  return fallbackChildFragment;
}

function mountSuspensePrimaryChildren(wip: FiberNode, primaryChildren: any) {
  const primaryChildrenProps: OffscreenProps = {
    mode: 'visible',
    children: primaryChildren
  };

  const primaryChildFragment = createFiberFromOffscreen(primaryChildrenProps);
  wip.child = primaryChildFragment;
  primaryChildFragment.return = wip;

  return primaryChildFragment;
}

function mountSuspenseFallbackChildren(wip: FiberNode, primaryChildren: any, fallbackChildren: any) {
  const primaryChildrenProps: OffscreenProps = {
    mode: 'hidden',
    children: primaryChildren
  };

  const primaryChildFragment = createFiberFromOffscreen(primaryChildrenProps);
  const fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);

  fallbackChildFragment.flags |= Placement;

  primaryChildFragment.return = wip;
  fallbackChildFragment.return = wip;

  primaryChildFragment.sibling = fallbackChildFragment;
  wip.child = primaryChildFragment;

  return fallbackChildFragment;
}

function updateOffscreenComponent(wip: FiberNode) {
  const nextProps = wip.pendingProps;
  const nextChildren = nextProps.children;
  reconcileChildren(wip, nextChildren);
  return wip.child;
}

function bailoutOnAlreadyFinishedWork(wip: FiberNode, renderLane: Lane) {
  if (!includeSomeLanes(wip.childLanes, renderLane)) {
    if (__DEV__) {
      console.warn('[bailoutOnAlreadyFinishedWork] bailout 整颗子树', wip);
    }
    return null;
  }

  if (__DEV__) {
    console.warn('bailout 一个 fiber', wip);
  }

  // todo：为什么要 clone 一下?
  cloneChildFibers(wip);
  return wip.child;
}

function checkScheduleUpdateOrContext(current: FiberNode, renderLane: Lane): boolean {
  const updateLanes = current.lanes;

  if (includeSomeLanes(updateLanes, renderLane)) {
    return true;
  }

  return false;
}

function updateContextProvider(wip: FiberNode, renderLane: Lane) {
  const providerType = wip.type;
  const context = providerType._context;
  const newProps = wip.pendingProps;
  const oldProps = wip.memoizedProps;
  const newValue = newProps.value;

  pushProvider(context, newValue);

  if (oldProps !== null) {
    const oldValue = oldProps.value;
    if (Object.is(oldValue, newValue) && oldProps.children === newProps.children) {
      return bailoutOnAlreadyFinishedWork(wip, renderLane);
    } else {
      propagateContextChange(wip, context, renderLane);
    }
  }

  const nextChildren = newProps.children;
  reconcileChildren(wip, nextChildren);
  return wip.child;
}

function updateFragment(wip: FiberNode) {
  const nextChildren = wip.pendingProps;
  reconcileChildren(wip, nextChildren);
  return wip.child;
}

function updateFunctionComponent(wip: FiberNode, Component: FiberNode['type'], renderLane: Lane) {
  prepareToReadContext(wip, renderLane);
  // 获取函数式组件的真正 ReactElement
  const nextChildren = renderWithHook(wip, Component, renderLane);

  const current = wip.alternate;
  if (current !== null && !didReceiveUpdate) {
    bailoutHook(wip, renderLane);
    return bailoutOnAlreadyFinishedWork(wip, renderLane);
  }

  reconcileChildren(wip, nextChildren);
  return wip.child;
}

/** 首屏渲染逻辑 */
function updateHostRoot(wip: FiberNode, renderLane: Lane) {
  const baseState = wip.memoizedState as Element;
  const updateQueue = wip.updateQueue as UpdateQueue<Element>;
  const pending = updateQueue.shared.pending;

  updateQueue.shared.pending = null;

  const prevChildren = wip.memoizedState;

  const { memoizedState } = processUpdateQueue<Element>(baseState, pending, renderLane);

  wip.memoizedState = memoizedState;
  // #region 为什么需要将 memoizedState 保存到 current 上
  /**
   * 背景：当在 Suspense 外部使用use 的时候，会因为找不到 Suspense 而丢弃整个 Fiber 树
   * 这就导致了一个问题，首屏渲染的时候，current HostRoot 的节点是 null，而 wip 在更新之后，清空了 pending。
   * 当重新渲染的时候就找不到对应的 pending 和节点了，所以导致了白屏
   */
  const current = wip.alternate;
  if (current !== null) {
    current.memoizedState = memoizedState;
  }
  // #endregion

  const nextChildren = wip.memoizedState;
  if (prevChildren === nextChildren) {
    return bailoutOnAlreadyFinishedWork(wip, renderLane);
  }

  reconcileChildren(wip, nextChildren as ReactElement);
  return wip.child;
}

function updateHostComponent(wip: FiberNode, renderLane: Lane) {
  const nextProps = wip.pendingProps;
  markRef(wip.alternate, wip);
  reconcileChildren(wip, nextProps.children);
  return wip.child;
}

function reconcileChildren(wip: FiberNode, children: ReactElement) {
  const current = wip.alternate;

  // 说明此时是 Update 流程（由于 mount 时，只有 hostRoot 的 alternate 不为空，所以刚刚好此时只需要给 APP Fiber 打上 Placement，实现离屏构建 DOM）
  if (current !== null) {
    wip.child = reconcileChildFibers(wip, current.child, children);
  }
  // 说明此时是 mount 流程
  else {
    wip.child = mountChildFibers(wip, null, children);
  }
}

function markRef(current: FiberNode | null, workInProgress: FiberNode) {
  const ref = workInProgress.ref;

  if ((current === null && ref !== null) || (current !== null && current.ref !== ref)) {
    workInProgress.flags |= Ref;
  }
}
