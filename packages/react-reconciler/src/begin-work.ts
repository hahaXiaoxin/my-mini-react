import { ReactElement } from 'shared/react-types';
import { FiberNode } from './fiber';
import { processUpdateQueue, UpdateQueue } from './update-queue';
import { Fragment, FunctionComponent, HostComponent, HostRoot, HostText } from './work-tags';
import { mountChildFibers, reconcileChildFibers } from './child-fibers';
import { renderWithHook } from './fiber-hooks';
import { Lane } from './fiber-lanes';
import { Ref } from './fiber-flags';

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
    default:
      if (__DEV__) {
        console.warn('beginWork 未实现的类型');
      }
      break;
  }
};

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
