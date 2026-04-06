import { HookDeps } from 'react-reconciler/src/fiber-hooks';
import { Action, ReactContext, Usable } from 'shared/react-types';

export interface Dispatcher {
  useState: <T>(initialState: (() => T) | T) => [T, Dispatch<T>];
  useEffect: (callback: () => void | void, deps: HookDeps | undefined) => void;
  useTransition: () => [boolean, (callback: () => void) => void];
  useRef: <T>(initialValue: T) => { current: T };
  useContext: <T>(context: ReactContext<T>) => T;
  use: <T>(usable: Usable<T>) => T;
  useMemo: <T>(nextCreate: () => T, deps: HookDeps | undefined) => T;
  useCallback: <T>(callback: T, deps: HookDeps | undefined) => T;
}

export type Dispatch<State> = (action: Action<State>) => void;

/**
 * 用于指向当前的 hooks 集合，update，mount不同阶段用的 hooks 集合不同
 */
const currentDispatcher: {
  current: null | Dispatcher;
} = {
  current: null
};

export const resolveDispatcher = (): Dispatcher => {
  const dispatcher = currentDispatcher.current;

  if (dispatcher === null) {
    throw new Error('hook只能在函数组件中执行');
  }

  return dispatcher;
};

export default currentDispatcher;
