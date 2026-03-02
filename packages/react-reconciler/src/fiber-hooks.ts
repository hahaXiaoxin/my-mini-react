import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatcher, Dispatch } from 'react/src/current-dispatcher';
import { createUpdate, createUpdateQueue, enqueueUpdate, processUpdateQueue, UpdateQueue } from './update-queue';
import { Action } from 'shared/react-types';
import { scheduleUpdateOnFiber } from './work-loop';
import { Lane, NoLane, requestUpdateLane } from './fiber-lanes';

/** 用于指向当前正在渲染的 FiberNode */
let currentlyRenderingFiber: FiberNode | null = null;
/** 指向当前正在处理的 hook */
let workInProgressHook: Hook | null = null;
/** 用于指向当前的 hook 数据 */
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;

const { currentDispatcher } = internals;

interface Hook {
  /** 用于记录 hook 的状态 */
  memoizedState: any;
  updateQueue: any;
  /** 指向当前 component 的下一个 hook */
  next: Hook | null;
}

export function renderWithHook(wip: FiberNode, lane: Lane) {
  // 赋值操作
  currentlyRenderingFiber = wip;
  // 重置 hooks 链表
  wip.memoizedState = null;

  renderLane = lane;

  const current = wip.alternate;

  // update
  if (current !== null) {
    currentDispatcher.current = HooksDispatcherOnUpdate;
  }
  // mount
  else {
    currentDispatcher.current = HooksDispatcherOnMount;
  }

  // 函数式组件的 type 就是对应的生成函数
  const Component = wip.type;
  const props = wip.pendingProps;
  // FC render
  const children = Component(props);

  // 重置操作
  currentlyRenderingFiber = null;
  workInProgressHook = null;
  currentHook = null;
  renderLane = NoLane;
  return children;
}

const HooksDispatcherOnMount: Dispatcher = {
  useState: mountState
};

const HooksDispatcherOnUpdate: Dispatcher = {
  useState: updateState
};

/** 挂载时使用的 useState */
function mountState<State>(initialState: (() => State) | State): [State, Dispatch<State>] {
  // 找到当前 useState 对应的 hook 数据
  const hook = mountWorkInProgressHook();
  let memoizedState = initialState;

  if (initialState instanceof Function) {
    memoizedState = initialState();
  }

  // 保存 state 到 hook
  hook.memoizedState = memoizedState;

  const queue = createUpdateQueue<State>();
  hook.updateQueue = queue;

  // 柯里化，让外部只需要传入 action
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const dispatch: Dispatch<State> = dispatchSetState.bind(null, currentlyRenderingFiber!, queue);
  queue.dispatch = dispatch;

  return [memoizedState as State, dispatch];
}

/** 更新时使用的 useState */
function updateState<State>(): [State, Dispatch<State>] {
  // 找到当前 useState 对应的 hook 数据
  const hook = updateWorkInProgressHook();

  // 计算新 state 的逻辑
  const queue = hook.updateQueue as UpdateQueue<State>;
  const pending = queue.shared.pending;

  if (pending !== null) {
    const { memoizedState } = processUpdateQueue(hook.memoizedState, pending, renderLane);
    hook.memoizedState = memoizedState;
  }

  return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

function dispatchSetState<State>(fiber: FiberNode, updateQueue: UpdateQueue<State>, action: Action<State>) {
  const lane = requestUpdateLane();
  const update = createUpdate<State>(action, lane);
  enqueueUpdate<State>(updateQueue, update);
  scheduleUpdateOnFiber(fiber, lane);
}

/** 获取到当前 hook 的数据 */
function mountWorkInProgressHook(): Hook {
  const hook: Hook = {
    memoizedState: null,
    updateQueue: null,
    next: null
  };

  // mount 时，第一个hook
  if (workInProgressHook === null) {
    // 如果不在
    if (currentlyRenderingFiber === null) {
      throw new Error('请在函数组件内调用 hook');
    }
    currentlyRenderingFiber.memoizedState = hook;
  } else {
    // mount 时的后续 hook
    workInProgressHook.next = hook;
  }

  // 移动链表指针指向下一个 hook
  workInProgressHook = hook;

  return workInProgressHook;
}

function updateWorkInProgressHook(): Hook {
  // TODO render 阶段触发的更新
  let nextCurrentHook: Hook | null;

  if (currentHook === null) {
    // 这是这个 FC update 时的第一个 hook
    const current = currentlyRenderingFiber?.alternate;
    // 判断当前是不是 mount 阶段（实际上 mount 阶段就不该调用 updateWorkInProgressHook）
    if (current !== null) {
      nextCurrentHook = current?.memoizedState as any;
    } else {
      nextCurrentHook = null;
    }
  } else {
    nextCurrentHook = currentHook.next;
  }

  if (nextCurrentHook === null) {
    // mount/update u1 u2 u3
    // update u1 u2 u3 u4
    throw new Error(`组件 ${currentlyRenderingFiber?.type}本次执行时的 hook 比上次执行时的 hook 要多`);
  }

  currentHook = nextCurrentHook as Hook;

  const newHook: Hook = {
    memoizedState: currentHook.memoizedState,
    updateQueue: currentHook.updateQueue,
    next: null
  };

  // mount 时，第一个hook
  if (workInProgressHook === null) {
    // 如果不在
    if (currentlyRenderingFiber === null) {
      throw new Error('请在函数组件内调用 hook');
    }
    currentlyRenderingFiber.memoizedState = newHook;
  } else {
    // mount 时的后续 hook
    workInProgressHook.next = newHook;
  }

  // 移动链表指针指向下一个 hook
  workInProgressHook = newHook;

  return workInProgressHook;
}
