import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatcher, Dispatch } from 'react/src/current-dispatcher';
import currentBatchConfig from 'react/src/current-batch-config';
import { createUpdate, createUpdateQueue, enqueueUpdate, processUpdateQueue, Update, UpdateQueue } from './update-queue';
import { Action, ReactContext } from 'shared/react-types';
import { scheduleUpdateOnFiber } from './work-loop';
import { Lane, NoLane, requestUpdateLane } from './fiber-lanes';
import { Flags, PassiveEffect } from './fiber-flags';
import { HookHasEffect, Passive } from './hook-effect-tags';

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
  baseState: any;
  baseQueue: Update<any> | null;
}

export interface Effect {
  tag: Flags;
  create: EffectCallback | void;
  destroy: EffectCallback | void;
  deps: EffectDeps;
  next: Effect | null;
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
  lastEffect: Effect | null;
}

type EffectCallback = () => void;
type EffectDeps = any[] | null;

export function renderWithHook(wip: FiberNode, lane: Lane) {
  // 赋值操作
  currentlyRenderingFiber = wip;
  // 重置 hooks 链表
  wip.memoizedState = null;
  // 充值 effect 链表
  wip.updateQueue = null;

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
  useState: mountState,
  useEffect: mountEffect,
  useTransition: mountTransition,
  useRef: mountRef,
  useContext: readContext
};

const HooksDispatcherOnUpdate: Dispatcher = {
  useState: updateState,
  useEffect: updateEffect,
  useTransition: updateTransition,
  useRef: updateRef,
  useContext: readContext
};

// #region useEffect
/** 挂载时使用的 useEffect */
function mountEffect(create: EffectCallback | void, deps: EffectDeps | void) {
  // 找到当前 useEffect 对应的 hook 数据
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  currentlyRenderingFiber!.flags |= PassiveEffect;

  hook.memoizedState = pushEffect(Passive | HookHasEffect, create, undefined, nextDeps);
}

function areHookInputsEqual(nextDeps: EffectDeps, prevDeps: EffectDeps) {
  if (prevDeps === null || nextDeps === null) {
    return false;
  }

  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    if (Object.is(prevDeps[i], nextDeps[i])) {
      continue;
    }

    return false;
  }

  return true;
}

function pushEffect(hookFlag: Flags, create: EffectCallback | void, destroy: EffectCallback | void, deps: EffectDeps): Effect {
  const effect: Effect = {
    tag: hookFlag,
    create,
    destroy,
    deps,
    next: null
  };

  const fiber = currentlyRenderingFiber as FiberNode;
  const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;

  if (updateQueue === null) {
    const updateQueue = createFCUpdateQueue();
    fiber.updateQueue = updateQueue;
    updateQueue.lastEffect = effect;
    effect.next = effect;
  } else {
    // 插入 effect
    const lastEffect = updateQueue.lastEffect;
    if (lastEffect === null) {
      effect.next = effect;
      updateQueue.lastEffect = effect;
    } else {
      const firstEffect = lastEffect.next;
      lastEffect.next = effect;
      effect.next = firstEffect;
      updateQueue.lastEffect = effect;
    }
  }

  return effect;
}

function createFCUpdateQueue<State>() {
  const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;

  updateQueue.lastEffect = null;
  return updateQueue;
}

/** 更新时使用的 useEffect */
function updateEffect(create: EffectCallback | void, deps: EffectDeps | void) {
  // 找到当前 useEffect 对应的 hook 数据
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  let destroy: EffectCallback | void;

  // 理论上来说不会等于 null，因为在updateWorkInProgressHook就已经判断过了
  if (currentHook !== null) {
    const prevEffect = currentHook.memoizedState as Effect;
    destroy = prevEffect.destroy;

    if (nextDeps !== null) {
      // 浅比较
      const prevDeps = prevEffect.deps;
      // 依赖没有变化，就不需要打上 HookHasEffect flag
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
        return;
      }
    }

    currentlyRenderingFiber!.flags |= PassiveEffect;
    hook.memoizedState = pushEffect(Passive | HookHasEffect, create, destroy, nextDeps);
  }
}
// #endregion

// #region useState
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
  hook.baseState = memoizedState;

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
  const baseState = hook.baseState;
  const pending = queue.shared.pending;
  const current = currentHook!;
  let baseQueue = current.baseQueue;

  if (pending !== null) {
    // pending baseQueue update 保存在 current 中
    if (baseQueue !== null) {
      // 两条环状链表的合并，看不懂就问 AI
      const baseFirst = baseQueue.next;
      const pendingFirst = pending.next;
      baseQueue.next = pendingFirst;
      pending.next = baseFirst;
    }
    baseQueue = pending;
    // 保存在 current 中
    current.baseQueue = pending;
    queue.shared.pending = null;
  }

  if (baseQueue !== null) {
    const { memoizedState, baseQueue: newBaseQueue, baseState: newBaseState } = processUpdateQueue(baseState, baseQueue, renderLane);
    hook.memoizedState = memoizedState;
    hook.baseState = newBaseState;
    hook.baseQueue = newBaseQueue;
  }

  return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

function dispatchSetState<State>(fiber: FiberNode, updateQueue: UpdateQueue<State>, action: Action<State>) {
  const lane = requestUpdateLane();
  const update = createUpdate<State>(action, lane);
  enqueueUpdate<State>(updateQueue, update);
  scheduleUpdateOnFiber(fiber, lane);
}
// #endregion

// #region useTransition
function mountTransition(): [boolean, (callback: () => void) => void] {
  const [isPending, setPending] = mountState(false);
  const hook = mountWorkInProgressHook();

  const start = startTransition.bind(null, setPending);
  hook.memoizedState = start;

  return [isPending, start];
}

function updateTransition(): [boolean, (callback: () => void) => void] {
  const [isPending] = updateState();
  const hook = updateWorkInProgressHook();

  const start = hook.memoizedState;
  hook.memoizedState = start;

  return [isPending as boolean, start];
}

function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
  // 先触发高优先级更新
  setPending(true);
  const prevTransition = currentBatchConfig.transition;
  currentBatchConfig.transition = 1;

  callback();
  setPending(false);

  currentBatchConfig.transition = prevTransition;
}
// #endregion

// #region useRef
function mountRef<T>(initialValue: T): { current: T } {
  const hook = mountWorkInProgressHook();
  const ref = { current: initialValue };
  hook.memoizedState = ref;
  return ref;
}

function updateRef<T>(_initialValue: T): { current: T } {
  const hook = updateWorkInProgressHook();
  return hook.memoizedState;
}
// #endregion

// #region useContext
function readContext<T>(context: ReactContext<T>): T {
  const consumer = currentlyRenderingFiber;
  if (consumer === null) {
    throw new Error('请在函数组件内调用 useContext');
  }

  const value = context._currentValue;

  return value;
}

// #endregion
/** mount 时，获取到当前 hook 的数据 */
function mountWorkInProgressHook(): Hook {
  const hook: Hook = {
    memoizedState: null,
    updateQueue: null,
    next: null,
    baseQueue: null,
    baseState: null
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
    next: null,
    baseQueue: currentHook.baseQueue,
    baseState: currentHook.baseState
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
