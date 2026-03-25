import { ReactContext } from 'shared/react-types';

let prevContextValue: any = null;

const prevContextValueStack: any[] = [];

/** 多个相同的 provider 进入时要入栈 */
export function pushProvider<T>(context: ReactContext<T>, newValue: T) {
  prevContextValueStack.push(prevContextValue);
  prevContextValue = context._currentValue;
  context._currentValue = newValue;
}

/**
 * 多个相同的 provider 在离开时要出栈
 */
export function popProvider<T>(context: ReactContext<T>) {
  context._currentValue = prevContextValue;

  prevContextValue = prevContextValueStack.pop();
}
