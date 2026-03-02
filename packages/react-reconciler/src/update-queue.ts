import { Dispatch } from 'react/src/current-dispatcher';
import { Action } from 'shared/react-types';
import { Lane } from './fiber-lanes';

export interface Update<State> {
  action: Action<State>;
  lane: Lane;
  next: Update<any> | null;
}

export interface UpdateQueue<State> {
  shared: {
    pending: Update<State> | null;
  };
  dispatch: Dispatch<State> | null;
}

/** 创建 Update 实例 */
export function createUpdate<State>(action: Action<State>, lane: Lane): Update<State> {
  return {
    action,
    lane,
    next: null
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
export function enqueueUpdate<State>(updateQueue: UpdateQueue<State>, update: Update<State>) {
  const pending = updateQueue.shared.pending;

  if (pending === null) {
    update.next = update;
  } else {
    update.next = pending.next;
    pending.next = update;
  }
  updateQueue.shared.pending = update;
}

/** 消费 updateQueue */
export function processUpdateQueue<State>(
  baseState: State,
  pendingUpdate: Update<State> | null,
  renderLane: Lane
): {
  memoizedState: State;
} {
  const result: { memoizedState: State } = {
    memoizedState: baseState
  };

  if (pendingUpdate !== null) {
    // 第一个 update
    const first = pendingUpdate.next;
    // update 是个环状链表，next 不会为空
    let pending = pendingUpdate.next!;
    do {
      const updateLane = pending.lane;

      if (updateLane === renderLane) {
        const action = pendingUpdate.action;

        if (action instanceof Function) {
          baseState = action(baseState);
        } else {
          baseState = action;
        }
      } else {
        if (__DEV__) {
          console.error('不应该进入这里');
        }
      }

      pending = pending.next!;
    } while (pending !== first);
  }

  result.memoizedState = baseState;
  return result;
}
