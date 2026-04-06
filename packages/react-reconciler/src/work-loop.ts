import { scheduleMicroTask } from 'host-config';
import { beginWork } from './begin-work';
import {
  commitHookEffectListCreate,
  commitHookEffectListDestroy,
  commitHookEffectListUnmount,
  commitLayoutEffects,
  commitMutationEffects
} from './commit-work';
import { completeWork } from './complete-work';
import { createWorkInProgress, FiberNode, FiberRootNode, PendingPassiveEffect } from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiber-flags';
import {
  getNextLane,
  Lane,
  laneToSchedulerPriority,
  markRootFinished,
  markRootSuspended,
  mergeLanes,
  NoLane,
  SyncLane
} from './fiber-lanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './sync-task-queue';
import { HostRoot } from './work-tags';
import {
  unstable_scheduleCallback as scheduleCallback,
  unstable_NormalPriority as NormalPriority,
  unstable_shouldYield,
  unstable_cancelCallback,
  CallbackNode
} from 'scheduler';
import { HookHasEffect, Passive } from './hook-effect-tags';
import { getSuspenseThenable, SuspenseException } from './thenable';
import { resetHooksOnUnwind } from './fiber-hooks';
import { throwException } from './fiber-throw';
import { unwindWork } from './fiber-unwind-work';

/** 全局指针，指向当前工作中的 fiberNode*/
let workInProgress: FiberNode | null = null;
/** 全局指针，指向当前正在处理的 lane */
let wipRootRenderLane: Lane = NoLane;
let rootDoesHasPassiveEffects = false;

// 工作中的状态
const RootInProgress = 0;
// 并发更新，中途打断
const RootInComplete = 1;
// 完成状态
const RootCompleted = 2;
// 未完成状态，不用进入commit阶段
const RootDidNotComplete = 3;

let wipRootExitStatus: number = RootInProgress;

type SuspendedReason = typeof NotSuspended | typeof SuspendedOnData;
const NotSuspended = 0;
const SuspendedOnData = 1;
let wipSuspendedReason: SuspendedReason = NotSuspended;
let wipThrownValue: any = null;

function prepareFreshStack(root: FiberRootNode, lane: Lane) {
  root.finishedLane = NoLane;
  root.finishedWork = null;
  workInProgress = createWorkInProgress(root.current, {});
  wipRootRenderLane = lane;

  wipRootExitStatus = RootInProgress;
  wipSuspendedReason = NotSuspended;
  wipThrownValue = null;
}

/** 在 Fiber 中进行调度更新 */
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
  // TODO 调度功能
  const root = markUpdateLaneFromFiberToRoot(fiber, lane);
  markRootUpdated(root, lane);
  ensureRootIsScheduled(root);
}

/**
 * schedule 阶段入口
 * 保证 root 被调度
 * */
export function ensureRootIsScheduled(root: FiberRootNode) {
  const updateLane = getNextLane(root);
  const existingCallbackNode = root.callbackNode;
  if (updateLane === NoLane) {
    if (existingCallbackNode !== null) {
      unstable_cancelCallback(existingCallbackNode);
    }
    root.callbackNode = null;
    root.callbackPriority = NoLane;
    return;
  }

  const curPriority = updateLane;
  const prevPriority = root.callbackPriority;

  if (curPriority === prevPriority) {
    return;
  }

  if (existingCallbackNode !== null) {
    unstable_cancelCallback(existingCallbackNode);
  }

  let newCallbackNode: CallbackNode | null = null;

  // 同步优先级 用微任务调度
  if (__DEV__) {
    console.log(`在${updateLane === SyncLane ? '微任务' : '宏任务'}中调度，优先级`, updateLane);
  }

  if (updateLane === SyncLane) {
    scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
    scheduleMicroTask(flushSyncCallbacks);
  } else {
    // 其他优先级 用宏任务调度
    const schedulerPriority = laneToSchedulerPriority(updateLane);
    newCallbackNode = scheduleCallback(schedulerPriority, performConcurrentWorkOnRoot.bind(null, root));
  }

  root.callbackNode = newCallbackNode;
  root.callbackPriority = curPriority;
}

/** 将需要消费的 lane 记录在 root 上*/
export function markRootUpdated(root: FiberRootNode, lane: Lane) {
  root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

/** 从当前节点向根节点标记 */
function markUpdateLaneFromFiberToRoot(fiber: FiberNode, lane: Lane) {
  let node = fiber;
  let parent = node.return;

  while (parent !== null) {
    parent.childLanes = mergeLanes(parent.childLanes, lane);
    const alternate = parent.alternate;

    // todo: 这里为什么要给 alternate 也标记 childLanes 呢
    if (alternate !== null) {
      alternate.childLanes = mergeLanes(alternate.childLanes, lane);
    }

    node = parent;
    parent = node.return;
  }

  if (node.tag === HostRoot) {
    return node.stateNode;
  }

  return null;
}

function performConcurrentWorkOnRoot(root: FiberRootNode, didTimeout?: boolean): any {
  // 保证 useEffect 都已经执行了
  const curCallbackNode = root.callbackNode;
  const didFlushPassiveEffect = flushPassiveEffects(root.pendingPassiveEffect);

  if (didFlushPassiveEffect) {
    if (root.callbackNode !== curCallbackNode) {
      return null;
    }
  }

  const lane = getNextLane(root);
  if (lane === NoLane) {
    return null;
  }

  const needSync = lane === SyncLane || didTimeout;

  // render 阶段
  const exitStatus = renderRoot(root, lane, !needSync);

  ensureRootIsScheduled(root);

  switch (exitStatus) {
    case RootInComplete:
      // 中断
      if (root.callbackNode !== curCallbackNode) {
        return null;
      }

      return performConcurrentWorkOnRoot.bind(null, root);
    case RootCompleted: {
      // 完成
      const finishedWork = root.current.alternate;
      root.finishedWork = finishedWork;
      root.finishedLane = lane;
      wipRootRenderLane = NoLane;

      // wip fiberNode 树和树中的 flags
      commitRoot(root);
      break;
    }
    case RootDidNotComplete:
      wipRootRenderLane = NoLane;
      markRootSuspended(root, lane);
      ensureRootIsScheduled(root);
      break;
    default:
      if (__DEV__) {
        console.error('还未实现的并发更新结束后逻辑');
      }
      break;
  }
}

function performSyncWorkOnRoot(root: FiberRootNode) {
  const nextLane = getNextLane(root);

  if (nextLane !== SyncLane) {
    // 其他比 syncLane 低的优先级
    // NoLane
    ensureRootIsScheduled(root);
    return;
  }

  if (__DEV__) {
    console.warn('render 阶段开始');
  }

  const exitStatus = renderRoot(root, nextLane, false);

  switch (exitStatus) {
    case RootCompleted: {
      const finishedWork = root.current.alternate;
      root.finishedWork = finishedWork;
      root.finishedLane = nextLane;
      wipRootRenderLane = NoLane;

      // wip fiberNode 树和树中的 flags
      commitRoot(root);
      break;
    }
    case RootDidNotComplete: {
      wipRootRenderLane = NoLane;
      markRootSuspended(root, nextLane);
      ensureRootIsScheduled(root);
      break;
    }
    default:
      if (__DEV__) {
        console.error('还未实现的同步更新结束后逻辑');
      }
      break;
  }
}

function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
  if (__DEV__) {
    console.log(`开始${shouldTimeSlice ? '并发' : '同步'}更新`);
  }

  if (wipRootRenderLane !== lane) {
    // 初始化
    prepareFreshStack(root, lane);
  }

  do {
    try {
      if (wipSuspendedReason !== NotSuspended && workInProgress !== null) {
        const thrownValue = wipThrownValue;
        wipSuspendedReason = NotSuspended;
        wipThrownValue = null;
        // unwind
        throwAndUnwindWorkLoop(root, workInProgress, thrownValue, lane);
      }

      if (shouldTimeSlice) {
        workLoopConcurrent();
      } else {
        workLoopSync();
      }
      break;
    } catch (e) {
      if (__DEV__) {
        console.warn('workLoop 发生错误', e);
      }
      handleThrow(root, e);
    }
    // eslint-disable-next-line no-constant-condition
  } while (true);

  if (wipRootExitStatus !== RootInProgress) {
    return wipRootExitStatus;
  }

  // 中断执行 || render 阶段执行完
  if (shouldTimeSlice && workInProgress !== null) {
    return RootInComplete;
  }
  // render 阶段执行完
  if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
    console.error(`render 阶段结束时 wip 不应该不是 null`);
  }
  // TODO 报错

  return RootCompleted;
}

function throwAndUnwindWorkLoop(root: FiberRootNode, unitOfWork: FiberNode, thrownValue: any, lane: Lane) {
  // 重试 FC 全局变量
  resetHooksOnUnwind();
  // 请求返回后重新触发更新
  throwException(root, thrownValue, lane);
  // unwind
  unwindUnitOfWork(unitOfWork);
}

function unwindUnitOfWork(unitOfWork: FiberNode) {
  let incompleteWork: FiberNode | null = unitOfWork;

  do {
    const next = unwindWork(incompleteWork);
    if (next !== null) {
      workInProgress = next;
      return;
    }

    const returnFiber = incompleteWork!.return as FiberNode;
    if (returnFiber !== null) {
      returnFiber.deletions = null;
    }
    incompleteWork = returnFiber;
  } while (incompleteWork !== null);

  // 使用了 use，抛出了 data，但是没有定义 suspense
  wipRootExitStatus = RootDidNotComplete;
  workInProgress = null;
}

function handleThrow(root: FiberRootNode, thrownValue: any) {
  // Error Boundary

  if (thrownValue === SuspenseException) {
    thrownValue = getSuspenseThenable();
    wipSuspendedReason = SuspendedOnData;
  }

  wipThrownValue = thrownValue;
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

    // layout
    commitLayoutEffects(finishedWork, root);
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
  let didFlushPassiveEffect = false;

  // 1. 组件卸载时：执行 destroy，不再触发 create
  pendingPassiveEffect.unmount.forEach((effect) => {
    didFlushPassiveEffect = true;
    commitHookEffectListUnmount(Passive, effect);
  });
  pendingPassiveEffect.unmount = [];

  // 2. 依赖变化时：先统一执行所有 destroy，再统一执行所有 create
  //    遍历两次是为了保证所有 destroy 在任何 create 之前执行
  pendingPassiveEffect.update.forEach((effect) => {
    commitHookEffectListDestroy(Passive | HookHasEffect, effect);
  });

  pendingPassiveEffect.update.forEach((effect) => {
    didFlushPassiveEffect = true;
    commitHookEffectListCreate(Passive | HookHasEffect, effect);
  });

  pendingPassiveEffect.update = [];

  // 3. 同步刷新 effect 回调中产生的新更新
  //    若 create 回调中调用了 setState，更新任务已被加入同步队列，
  //    在此立即消费，不等微任务，确保在同一个宏任务内完成 render + commit
  flushSyncCallbacks();

  return didFlushPassiveEffect;
}

function workLoopSync() {
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

function workLoopConcurrent() {
  while (workInProgress !== null && !unstable_shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}

/** 遍历子节点，向下递的过程就是beginWork */
function performUnitOfWork(fiber: FiberNode) {
  const next = beginWork(fiber, wipRootRenderLane);
  fiber.memoizedProps = fiber.pendingProps;

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
