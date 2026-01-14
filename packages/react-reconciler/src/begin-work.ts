import { ReactElement } from 'shared/react-types';
import { FiberNode } from './fiber';
import { processUpdateQueue, UpdateQueue } from './update-queue';
import { HostComponent, HostRoot, HostText } from './work-tags';
import { mountChildFibers, reconcileChildFibers } from './child-fibers';

// 递归中的“递”
export const beginWork = (wip: FiberNode) => {
  // 比较，返回子 fiberNode
  switch (wip.tag) {
    case HostRoot:
      return updateHostRoot(wip);
    case HostText:
      return updateHostComponent(wip);
    case HostComponent:
      return;
    default:
      if (__DEV__) {
        console.warn('beginWork 未实现的类型');
      }
      break;
  }
};

function updateHostRoot(wip: FiberNode) {
  const baseState = wip.memoizedState as Element;
  const updateQueue = wip.updateQueue as UpdateQueue<Element>;
  const pending = updateQueue.shared.pending;

  updateQueue.shared.pending = null;

  const { memoizedState } = processUpdateQueue<Element>(baseState, pending!);
  wip.memoizedState = memoizedState;

  const nextChildren = wip.memoizedState;
  reconcileChildren(wip, nextChildren);
  return wip.child;
}

function updateHostComponent(wip: FiberNode) {
  const nextProps = wip.pendingProps;
  reconcileChildren(wip, nextProps.children);
  return wip.child;
}

function reconcileChildren(wip: FiberNode, children: ReactElement) {
  const current = wip.alternate;

  // 说明此时是 Update 流程
  if (current !== null) {
    wip.child = reconcileChildFibers(wip, current.child, children);
  }
  // 说明此时是 mount 流程
  else {
    wip.child = mountChildFibers(wip, null, children);
  }
}
