import { Action } from 'shared/react-types';

export interface Update<State> {
  action: Action<State>;
}

export interface UpdateQueue<State> {
  shared: {
    pending: Update<State> | null;
  };
}

/** 创建 Update 实例 */
export function createUpdate<State>(action: Action<State>): Update<State> {
  return {
    action
  };
}

/** 创建 UpdateQueue 实例*/
export const createUpdateQueue = <State>() => {
  return {
    shared: {
      pending: null
    }
  } as UpdateQueue<State>;
};

/**  */
export function enqueueUpdate<State>(updateQueue: UpdateQueue<State>, update: Update<State>) {
  updateQueue.shared.pending = update;
}

/** 消费 updateQueue */
export function processUpdateQueue<State>(
  baseState: State,
  pendingUpdate: Update<State>
): {
  memoizedState: State;
} {
  const result: { memoizedState: State } = {
    memoizedState: baseState
  };

  if (pendingUpdate !== null) {
    const action = pendingUpdate.action;
    if (action instanceof Function) {
      result.memoizedState = action(baseState);
    } else {
      result.memoizedState = action;
    }
  }

  return result;
}
