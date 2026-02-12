import { jsx } from './src/jsx';
import currentDispatcher from './src/current-dispatcher';
import { Dispatcher, resolveDispatcher } from './src/current-dispatcher';
// React

/**
 * 实现了不同阶段调用不同的 hook
 */
export const useState: Dispatcher['useState'] = (initialState) => {
  const dispatcher = resolveDispatcher();
  return dispatcher.useState(initialState);
};

/** 内部数据共享层 */
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
  currentDispatcher
};

export default {
  version: '0.0.0',
  createElement: jsx
};
