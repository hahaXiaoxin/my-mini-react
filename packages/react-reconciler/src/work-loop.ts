import { scheduleMicroTask } from 'host-config';
import { beginWork } from './begin-work';
import { commitHookEffectListCreate, commitHookEffectListDestroy, commitHookEffectListUnmount, commitMutationEffects } from './commit-work';
import { completeWork } from './complete-work';
import { createWorkInProgress, FiberNode, FiberRootNode, PendingPassiveEffect } from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiber-flags';
import { getHighestPriorityLane, Lane, markRootFinished, mergeLanes, NoLane, SyncLane } from './fiber-lanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './sync-task-queue';
import { HostRoot } from './work-tags';
import { unstable_scheduleCallback as scheduleCallback, unstable_NormalPriority as NormalPriority } from 'scheduler';
import { HookHasEffect, Passive } from './hook-effect-tags';

/** 全局指针，指向当前工作中的 fiberNode*/
let workInProgress: FiberNode | null = null;
/** 全局指针，指向当前正在处理的 lane */
let wipRootRenderLane: Lane = NoLane;
let rootDoesHasPassiveEffects: boolean = false;

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

  if ((finishedWork.flags & PassiveMask) !== NoFlags || (finishedWork.subtreeFlags & PassiveMask) !== NoFlags) {
    if (!rootDoesHasPassiveEffects) {
      rootDoesHasPassiveEffects = true;
      // 调度副作用
      scheduleCallback(NormalPriority, () => {
        // 执行副作用
        flushPassiveEffects(root.pendingPassiveEffect);
        return;
      });
    }
  }

  // 判断是否存在三个子阶段需要执行的操作
  const subTreeHasEffect = (finishedWork.subtreeFlags & (MutationMask | PassiveMask)) !== NoFlags;
  const rootHasEffect = (finishedWork.flags & (MutationMask | PassiveMask)) !== NoFlags;

  if (subTreeHasEffect || rootHasEffect) {
    // beforeMutation 阶段：DOM 操作前
    // mutation 阶段：DOM 操作
    commitMutationEffects(finishedWork, root);
    root.current = finishedWork;

    // layout 阶段：DOM 操作后
  } else {
    root.current = finishedWork;
  }

  rootDoesHasPassiveEffects = false;
  ensureRootIsScheduled(root);
}

/**
 * 执行 useEffect 的回调（由 scheduler 以 NormalPriority 宏任务调度）
 *
 * 执行时序：
 * 1. 执行 unmount 的 destroy（组件卸载场景）
 * 2. 执行 update 的 destroy（依赖变化场景，先统一销毁）
 * 3. 执行 update 的 create（依赖变化场景，再统一创建）
 * 4. 同步刷新 effect 回调中可能产生的新更新
 *
 * 关于第 4 步的说明：
 * effect 的 create 回调中可能调用 setState，这会走正常的
 * scheduleUpdateOnFiber → scheduleSyncCallback + scheduleMicroTask 路径。
 * 但微任务要等当前宏任务执行完才能执行，所以在这里手动调用 flushSyncCallbacks()
 * 立即同步消费队列中的更新任务（render + commit），确保在同一个宏任务内完成，
 * 避免用户看到中间不一致的状态。等微任务真正执行时队列已空，相当于空跑。
 */
function flushPassiveEffects(pendingPassiveEffect: PendingPassiveEffect) {
  // 1. 组件卸载时：执行 destroy，不再触发 create
  pendingPassiveEffect.unmount.forEach((effect) => {
    commitHookEffectListUnmount(Passive, effect);
  });
  pendingPassiveEffect.unmount = [];

  // 2. 依赖变化时：先统一执行所有 destroy，再统一执行所有 create
  //    遍历两次是为了保证所有 destroy 在任何 create 之前执行
  pendingPassiveEffect.update.forEach((effect) => {
    commitHookEffectListDestroy(Passive | HookHasEffect, effect);
  });

  pendingPassiveEffect.update.forEach((effect) => {
    commitHookEffectListCreate(Passive | HookHasEffect, effect);
  });

  pendingPassiveEffect.update = [];

  // 3. 同步刷新 effect 回调中产生的新更新
  //    若 create 回调中调用了 setState，更新任务已被加入同步队列，
  //    在此立即消费，不等微任务，确保在同一个宏任务内完成 render + commit
  flushSyncCallbacks();
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
