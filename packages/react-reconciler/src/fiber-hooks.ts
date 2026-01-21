import { FiberNode } from './fiber';

export function renderWithHook(wip: FiberNode) {
  // 函数式组件的 type 就是对应的生成函数
  const Component = wip.type;
  const props = wip.pendingProps;
  const children = Component(props);

  return children;
}
