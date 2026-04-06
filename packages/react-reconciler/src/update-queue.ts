import { Dispatch } from 'react/src/current-dispatcher';
import { Action } from 'shared/react-types';
import { isSubsetOfLanes, Lane, mergeLanes, NoLane } from './fiber-lanes';
import { FiberNode } from './fiber';

export interface Update<State> {
  action: Action<State>;
  lane: Lane;
  next: Update<any> | null;
  hasEagerState: boolean;
  eagerState: State | null;
}

export interface UpdateQueue<State> {
  shared: {
    pending: Update<State> | null;
  };
  dispatch: Dispatch<State> | null;
}

/** 创建 Update 实例 */
export function createUpdate<State>(
  action: Action<State>,
  lane: Lane,
  hasEagerState: boolean = false,
  eagerState: State | null = null
): Update<State> {
  return {
    action,
    lane,
    next: null,
    hasEagerState,
    eagerState
  };
}

/** 创建 UpdateQueue 实例*/
export const createUpdateQueue = <State>() => {
  return {
    shared: {
      pending: null
    },
    dispatch: null
  } as UpdateQueue<State>;
};

/**
 * 向更新队列中插入 update
 * pending 指向最新插入的 update
 *
 * 最终所有的 update 会形成一个环（不知道意义何在）
 * 1. 这样 pending.next 就会指向最早插入的一个 update（有点高级，环状链表的新用法，头尾指针二合一了属于是）
 * */
export function enqueueUpdate<State>(updateQueue: UpdateQueue<State>, update: Update<State>, fiber: FiberNode, lane: Lane) {
  const pending = updateQueue.shared.pending;

  if (pending === null) {
    update.next = update;
  } else {
    update.next = pending.next;
    pending.next = update;
  }
  updateQueue.shared.pending = update;

  fiber.lanes = mergeLanes(fiber.lanes, lane);
  const alternate = fiber.alternate;
  if (alternate !== null) {
    // todo：这里为什么要给 alternate.lanes 赋值
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  }
}

/** 消费 updateQueue */
export function processUpdateQueue<State>(
  baseState: State,
  pendingUpdate: Update<State> | null,
  renderLane: Lane,
  onSkipUpdate?: (update: Update<State>) => void
): {
  memoizedState: State;
  baseState: State;
  baseQueue: Update<State> | null;
} {
  const result: {
    memoizedState: State;
    baseState: State;
    baseQueue: Update<State> | null;
  } = {
    memoizedState: baseState,
    baseState,
    baseQueue: null
  };

  if (pendingUpdate !== null) {
    // 第一个 update
    const first = pendingUpdate.next;
    // update 是个环状链表，next 不会为空
    let pending = pendingUpdate.next!;

    let newBaseState = baseState;
    let newBaseQueueFirst: Update<State> | null = null;
    let newBaseQueueLast: Update<State> | null = null;
    let newState = baseState;

    do {
      const updateLane = pending.lane;

      if (!isSubsetOfLanes(renderLane, updateLane)) {
        // 优先级不够，被跳过
        const clone = createUpdate(pending.action, pending.lane);

        onSkipUpdate?.(clone);

        // 是不是第一个被跳过的
        if (newBaseQueueFirst === null) {
          newBaseQueueFirst = clone;
          newBaseQueueLast = clone;
          newBaseState = newState;
        } else {
          newBaseQueueLast!.next = clone;
          newBaseQueueLast = clone;
        }
      } else {
        // 优先级足够
        if (newBaseQueueLast !== null) {
          const clone = createUpdate(pending.action, NoLane);
          newBaseQueueLast.next = clone;
          newBaseQueueLast = clone;
        }

        const action = pendingUpdate.action;
        if (pending.hasEagerState) {
          newState = pending.eagerState;
        } else {
          newState = basicStateReducer(baseState, action);
        }
      }

      pending = pending.next!;
    } while (pending !== first);

    if (newBaseQueueLast === null) {
      // 本次计算没有 update 被跳过
      newBaseState = newState;
    } else {
      newBaseQueueLast!.next = newBaseQueueFirst;
    }
    // 当前高优先级任务执行后的结果（需要给用户看的）
    result.memoizedState = newState;
    // 下一次更新时的基础，需要使用 baseState + baseQueue 来计算
    result.baseState = newBaseState;
    result.baseQueue = newBaseQueueLast;
  }

  return result;
}

export function basicStateReducer<State>(state: State, action: Action<State>): State {
  if (action instanceof Function) {
    return action(state);
  } else {
    return action;
  }
}
