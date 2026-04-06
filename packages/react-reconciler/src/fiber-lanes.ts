import {
  unstable_getCurrentPriorityLevel,
  unstable_IdlePriority,
  unstable_ImmediatePriority,
  unstable_NormalPriority,
  unstable_UserBlockingPriority
} from 'scheduler';
import { FiberRootNode } from './fiber';
import ReactCurrentBatchConfig from 'react/src/current-batch-config';

export type Lane = number;
export type Lanes = number;

export const SyncLane = 0b00001;
export const NoLane = 0b00000;
export const InputContinuousLane = 0b00010;
export const DefaultLane = 0b00100;
export const TransitionLane = 0b01000;
export const IdleLane = 0b10000;

export const NoLanes = 0b00000;

export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
  return laneA | laneB;
}

export function requestUpdateLane() {
  const isTransition = ReactCurrentBatchConfig.transition !== null;
  if (isTransition) {
    return TransitionLane;
  }

  // 从上下文中获取 Schedule 优先级
  const currentSchedulerPriority = unstable_getCurrentPriorityLevel();
  const lane = schedulerPriorityToLane(currentSchedulerPriority);
  return lane;
}

function getHighestPriorityLane(lanes: Lanes): Lane {
  return lanes & -lanes;
}

export function isSubsetOfLanes(set: Lanes, subset: Lane) {
  return (set & subset) === subset;
}

export function markRootFinished(root: FiberRootNode, lane: Lane) {
  root.pendingLanes &= ~lane;

  root.suspendedLanes = NoLanes;
  root.pingedLanes = NoLanes;
}

export function laneToSchedulerPriority(lanes: Lanes) {
  const lane = getHighestPriorityLane(lanes);

  if (lane === SyncLane) {
    return unstable_ImmediatePriority;
  }

  if (lane === InputContinuousLane) {
    return unstable_UserBlockingPriority;
  }

  if (lane === DefaultLane) {
    return unstable_NormalPriority;
  }

  return unstable_IdlePriority;
}

function schedulerPriorityToLane(schedulerPriority: number): Lane {
  if (schedulerPriority === unstable_ImmediatePriority) {
    return SyncLane;
  }

  if (schedulerPriority === unstable_UserBlockingPriority) {
    return InputContinuousLane;
  }

  if (schedulerPriority === unstable_NormalPriority) {
    return DefaultLane;
  }

  return NoLane;
}

/**
 * 数据还未回来时，将某个 lane 标记为挂起
 * 该 lane 将不会被调度
 */
export function markRootSuspended(root: FiberRootNode, suspendedLanes: Lanes) {
  root.suspendedLanes |= suspendedLanes;
  root.pingedLanes &= ~suspendedLanes;
}

/**
 * 当被 ping 了之后，说明某个数据回来了，将该 lane 标记为 ping
 */
export function markRootPinged(root: FiberRootNode, pingedLanes: Lanes) {
  root.pingedLanes |= pingedLanes & root.suspendedLanes;
}

/**
 * 调度逻辑：
 * 1. 优先调度不在 suspendedLanes 的 lane
 * 2. 其次调度 pingedLanes 中的 lane，数据回来了，可以渲染了
 */
export function getNextLane(root: FiberRootNode): Lane {
  const pendingLanes = root.pendingLanes;

  if (pendingLanes === NoLanes) {
    return NoLane;
  }

  let nextLane = NoLane;

  const suspendedLanes = pendingLanes & ~root.suspendedLanes;

  if (suspendedLanes !== NoLanes) {
    nextLane = getHighestPriorityLane(suspendedLanes);
  } else {
    const pingedLanes = pendingLanes & root.pingedLanes;

    if (pingedLanes !== NoLanes) {
      nextLane = getHighestPriorityLane(pingedLanes);
    }
  }

  return nextLane;
}

/** 判断两者是否有交集 */
export function includeSomeLanes(set: Lanes, subset: Lane | Lanes): boolean {
  return (set & subset) !== NoLanes;
}

export function removeLanes(set: Lanes, subset: Lane | Lanes): Lanes {
  return set & ~subset;
}
