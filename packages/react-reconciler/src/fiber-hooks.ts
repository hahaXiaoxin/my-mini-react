import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatcher, Dispatch } from 'react/src/current-dispatcher';
import { createUpdate, createUpdateQueue, enqueueUpdate, UpdateQueue } from './update-queue';
import { Action } from 'shared/react-types';
import { scheduleUpdateOnFiber } from './work-loop';

/** 用于指向当前正在渲染的 FiberNode */
let currentlyRenderingFiber: FiberNode | null = null;
/** 指向当前正在处理的 hook */
let workInProgressHook: Hook | null = null;

const { currentDispatcher } = internals;

interface Hook {
  /** 用于记录 hook 的状态 */
  memoizedState: any;
  updateQueue: any;
  /** 指向当前 component 的下一个 hook */
  next: Hook | null;
}

export function renderWithHook(wip: FiberNode) {
  // 赋值操作
  currentlyRenderingFiber = wip;
  // 重置操作
  wip.memoizedState = null;

  const current = wip.alternate;

  // update
  if (current !== null) {
  }
  // mount
  else {
    currentDispatcher.current = HooksDispatcherOnMount;
  }

  // 函数式组件的 type 就是对应的生成函数
  const Component = wip.type;
  const props = wip.pendingProps;
  const children = Component(props);

  // 重置操作
  currentlyRenderingFiber = null;

  return children;
}

const HooksDispatcherOnMount: Dispatcher = {
  useState: mountState
};

/** 挂载时使用的 useState */
function mountState<State>(initialState: (() => State) | State): [State, Dispatch<State>] {
  const hook = mountWorkInProgressHook();
  let memoizedState = initialState;

  if (initialState instanceof Function) {
    memoizedState = initialState();
  }

  const queue = createUpdateQueue<State>();
  hook.updateQueue = queue;

  // 柯里化，让外部只需要传入 action
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const dispatch: Dispatch<State> = dispatchSetState.bind(null, currentlyRenderingFiber!, queue);

  return [memoizedState as State, dispatch];
}

function dispatchSetState<State>(fiber: FiberNode, updateQueue: UpdateQueue<State>, action: Action<State>) {
  const update = createUpdate<State>(action);
  enqueueUpdate<State>(updateQueue, update);
  scheduleUpdateOnFiber(fiber);
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
