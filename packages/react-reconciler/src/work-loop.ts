import { scheduleMicroTask } from 'host-config';
import { beginWork } from './begin-work';
import { commitMutationEffects } from './commit-work';
import { completeWork } from './complete-work';
import { createWorkInProgress, FiberNode, FiberRootNode } from './fiber';
import { MutationMask, NoFlags } from './fiber-flags';
import { getHighestPriorityLane, Lane, markRootFinished, mergeLanes, NoLane, SyncLane } from './fiber-lanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './sync-task-queue';
import { HostRoot } from './work-tags';

/** 全局指针，指向当前工作中的 fiberNode*/
let workInProgress: FiberNode | null = null;
/** 全局指针，指向当前正在处理的 lane */
let wipRootRenderLane: Lane = NoLane;

function prepareRefreshStack(root: FiberRootNode, lane: Lane) {
  workInProgress = createWorkInProgress(root.current, {});
  wipRootRenderLane = lane;
}

/** 在 Fiber 中进行调度更新 */
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
  // TODO 调度功能
  const root = markUpdateFromFiberToRoot(fiber);
  markRootUpdated(root, lane);
  ensureRootIsScheduled(root);
}

/**
 * schedule 阶段入口
 * 保证 root 被调度
 * */
function ensureRootIsScheduled(root: FiberRootNode) {
  const updateLane = getHighestPriorityLane(root.pendingLanes);
  if (updateLane === NoLane) return;

  if (updateLane === SyncLane) {
    // 同步优先级 用微任务调度
    if (__DEV__) {
      console.log('在微任务中调度，优先级', updateLane);
    }

    scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane));
    scheduleMicroTask(flushSyncCallbacks);
  } else {
    // 其他优先级 用宏任务调度
  }
}

/** 将需要消费的 lane 记录在 root 上*/
function markRootUpdated(root: FiberRootNode, lane: Lane) {
  root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

/** 从当前节点向根节点标记 */
function markUpdateFromFiberToRoot(fiber: FiberNode) {
  let node = fiber;
  let parent = node.return;

  while (parent !== null) {
    node = parent;
    parent = node.return;
  }

  if (node.tag === HostRoot) {
    return node.stateNode;
  }

  return null;
}

function performSyncWorkOnRoot(root: FiberRootNode, lane: Lane) {
  const nextLane = getHighestPriorityLane(root.pendingLanes);

  if (nextLane !== SyncLane) {
    // 其他比 syncLane 高的优先级
    // NoLane
    ensureRootIsScheduled(root);
    return;
  }

  if (__DEV__) {
    console.warn('render 阶段开始');
  }

  // 初始化
  prepareRefreshStack(root, lane);

  try {
    workLoop();
  } catch (e) {
    if (__DEV__) {
      console.warn('workLoop 发生错误', e);
    }
    workInProgress = null;
  }

  const finishedWork = root.current.alternate;
  root.finishedWork = finishedWork;
  root.finishedLane = lane;
  wipRootRenderLane = NoLane;

  // wip fiberNode 树和树中的 flags
  commitRoot(root);
}

function commitRoot(root: FiberRootNode) {
  const finishedWork = root.finishedWork;

  if (finishedWork === null) {
    return;
  }

  if (__DEV__) {
    console.warn('commit 阶段开始', finishedWork);
  }
  const lane = root.finishedLane;

  if (lane === NoLane && __DEV__) {
    console.error('commit 阶段 finishedLane 不应该是 NoLane');
  }
  // 重置
  root.finishedWork = null;
  root.finishedLane = NoLane;

  markRootFinished(root, lane);

  // 判断是否存在三个子阶段需要执行的操作
  const subTreeHasEffect = (finishedWork.subtreeFlags & MutationMask) !== NoFlags;
  const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

  if (subTreeHasEffect || rootHasEffect) {
    // beforeMutation 阶段：DOM 操作前
    // mutation 阶段：DOM 操作
    commitMutationEffects(finishedWork);
    root.current = finishedWork;

    // layout 阶段：DOM 操作后
  } else {
    root.current = finishedWork;
  }
}

function workLoop() {
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

/** 遍历子节点，向下递的过程就是beginWork */
function performUnitOfWork(fiber: FiberNode) {
  const next = beginWork(fiber, wipRootRenderLane);
  fiber.memoizdedProps = fiber.pendingProps;

  // todo：类型貌似有问题，undefined 不能赋值，那么提前处理一下这个路径
  if (next === undefined) return;

  if (next === null) {
    completeUnitOfWork(fiber);
  } else {
    workInProgress = next;
  }
}

/** 遍历兄弟节点，向上归的过程就是 completeWork */
function completeUnitOfWork(fiber: FiberNode) {
  let node: FiberNode | null = fiber;

  do {
    completeWork(node);

    const sibling = node.sibling;
    if (sibling !== null) {
      workInProgress = sibling;
      return;
    }

    // 没有兄弟节点之后就返回父节点
    node = node.return;
    workInProgress = node;
  } while (node !== null);
}
