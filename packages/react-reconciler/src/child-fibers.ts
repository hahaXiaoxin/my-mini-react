import { ReactElement } from 'shared/react-types';
import { createFiberFromElement, FiberNode } from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/react-symbols';
import { HostText } from './work-tags';
import { Placement } from './fiber-flags';

function ChildReconciler(shouldTrackEffects: boolean) {
  function reconcileSingleElement(returnFiber: FiberNode, currentFirstChild: FiberNode | null, element: ReactElement) {
    // 根据 element 创建 fiber 并返回
    const fiber = createFiberFromElement(element);
    fiber.return = returnFiber;
    return fiber;
  }

  function reconcileSingleTextNode(returnFiber: FiberNode, currentFirstChild: FiberNode | null, textContent: string) {
    // 根据 textContent 创建 fiber 并返回
    const fiber = new FiberNode(HostText, { content: textContent }, null);
    fiber.return = returnFiber;
    return fiber;
  }

  /** 加上 placement 标记 */
  function placeSingleChild(fiber: FiberNode) {
    // 只有在首屏渲染并且 shouldTrackEffects 为 true 时，才设置 Placement 标志
    if (shouldTrackEffects && fiber.alternate === null) {
      fiber.flags |= Placement;
    }

    return fiber;
  }

  return function reconcileChildFibers(returnFiber: FiberNode, currentFirstChild: FiberNode | null, newChild: ReactElement): FiberNode | null {
    // 判断当前 fiber 的类型
    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return placeSingleChild(reconcileSingleElement(returnFiber, currentFirstChild, newChild));

        default:
          if (__DEV__) {
            console.warn('未实现的 reconcile 类型', newChild);
          }
          break;
      }
    }
    // TODO 处理多节点的情况

    // HostText
    if (typeof newChild === 'string' || typeof newChild === 'number') {
      return placeSingleChild(reconcileSingleTextNode(returnFiber, currentFirstChild, newChild));
    }

    if (__DEV__) {
      console.warn('未实现的 reconcile 类型', newChild);
    }

    return null;
  };
}

/** 追踪副作用 */
export const reconcileChildFibers = ChildReconciler(true);

/** 不追踪副作用 */
export const mountChildFibers = ChildReconciler(false);
