import { Action } from 'shared/react-types';

export interface Dispatcher {
  useState: <T>(initialState: (() => T) | T) => [T, Dispatch<T>];
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
