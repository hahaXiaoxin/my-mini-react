import { ReactElement } from 'shared/react-types';
import { createFiberFromFragment, createFiberFromOffscreen, createWorkInProgress, FiberNode, OffscreenProps } from './fiber';
import { processUpdateQueue, UpdateQueue } from './update-queue';
import { ContextProvider, Fragment, FunctionComponent, HostComponent, HostRoot, HostText, OffscreenComponent, SuspenseComponent } from './work-tags';
import { mountChildFibers, reconcileChildFibers } from './child-fibers';
import { renderWithHook } from './fiber-hooks';
import { Lane } from './fiber-lanes';
import { ChildDeletion, DidCapture, NoFlags, Placement, Ref } from './fiber-flags';
import { pushProvider } from './fiber-context';
import { pushSuspenseHandler } from './suspense-context';

// 递归中的“递”
export const beginWork = (wip: FiberNode, renderLane: Lane) => {
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
      return updateFunctionComponent(wip, renderLane);
    case Fragment:
      return updateFragment(wip);
    case ContextProvider:
      return updateContextProvider(wip);
    case SuspenseComponent:
      return updateSuspenseComponent(wip);
    case OffscreenComponent:
      return updateOffscreenComponent(wip);
    default:
      if (__DEV__) {
        console.warn('beginWork 未实现的类型');
      }
      break;
  }
};

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

function updateContextProvider(wip: FiberNode) {
  const providerType = wip.type;
  const context = providerType._context;
  const newProps = wip.pendingProps;

  pushProvider(context, newProps.value);

  const nextChildren = newProps.children;
  reconcileChildren(wip, nextChildren);
  return wip.child;
}

function updateFragment(wip: FiberNode) {
  const nextChildren = wip.pendingProps;
  reconcileChildren(wip, nextChildren);
  return wip.child;
}

function updateFunctionComponent(wip: FiberNode, renderLane: Lane) {
  // 获取函数式组件的真正 ReactElement
  const nextChildren = renderWithHook(wip, renderLane);
  reconcileChildren(wip, nextChildren);
  return wip.child;
}

/** 首屏渲染逻辑 */
function updateHostRoot(wip: FiberNode, renderLane: Lane) {
  const baseState = wip.memoizedState as Element;
  const updateQueue = wip.updateQueue as UpdateQueue<Element>;
  const pending = updateQueue.shared.pending;

  updateQueue.shared.pending = null;

  const { memoizedState } = processUpdateQueue<Element>(baseState, pending, renderLane);

  // #region 为什么需要将 memoizedState 保存到 current 上
  /**
   * 背景：当在 Suspense 外部使用use 的时候，会因为找不到 Suspense 而丢弃整个 Fiber 树
   * 这就导致了一个问题，首屏渲染的时候，current HostRoot 的节点是 null，而 wip 在更新之后，清空了 pending。当重新渲染的时候就找不到对应的 pending 和节点了，所以导致了白屏
   */
  const current = wip.alternate;
  if (current !== null) {
    current.memoizedState = memoizedState;
  }
  // #endregion
  wip.memoizedState = memoizedState;

  const nextChildren = wip.memoizedState;
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
