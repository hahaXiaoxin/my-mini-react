import { Props, ReactElement } from 'shared/react-types';
import { createFiberFromElement, createWorkInProgress, FiberNode } from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/react-symbols';
import { HostText } from './work-tags';
import { ChildDeletion, Placement } from './fiber-flags';

function ChildReconciler(shouldTrackEffects: boolean) {
  /** 删除子节点 */
  function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode) {
    if (!shouldTrackEffects) return;

    const deletions = returnFiber.deletions;
    if (deletions === null) {
      returnFiber.deletions = [childToDelete];
      returnFiber.flags |= ChildDeletion;
    } else {
      deletions.push(childToDelete);
    }
  }

  /** 处理单个元素 */
  function reconcileSingleElement(returnFiber: FiberNode, currentFiber: FiberNode | null, element: ReactElement) {
    // update 流程
    const key = element.key;
    work: if (currentFiber !== null) {
      // key 相同
      if (currentFiber.key === key) {
        if (element.$$typeof === REACT_ELEMENT_TYPE) {
          // type 相同
          if (currentFiber.type === element.type) {
            const existing = useFiber(currentFiber, element.props);
            existing.return = returnFiber;
            return existing;
          }

          // type 不相同直接删掉
          deleteChild(returnFiber, currentFiber);
          break work;
        }

        if (__DEV__) {
          console.warn('还未实现的 react 类型', element);
        }

        break work;
      }
      // key 不相同则删掉旧的
      deleteChild(returnFiber, currentFiber);
    }

    // 根据 element 创建 fiber 并返回
    const fiber = createFiberFromElement(element);
    fiber.return = returnFiber;
    return fiber;
  }

  /** 处理单个文本节点 */
  function reconcileSingleTextNode(returnFiber: FiberNode, currentFiber: FiberNode | null, content: string) {
    // update
    if (currentFiber !== null) {
      if (currentFiber.tag === HostText) {
        // 类型没变可以复用
        const existing = useFiber(currentFiber, { content });
        existing.return = returnFiber;

        return existing;
      }

      // 否则则移除
      deleteChild(returnFiber, currentFiber);
    }

    // 根据 textContent 创建 fiber 并返回
    const fiber = new FiberNode(HostText, { content }, null);
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

    if (currentFirstChild !== null) {
      // 兜底删除
      deleteChild(returnFiber, currentFirstChild);
    }

    if (__DEV__) {
      console.warn('未实现的 reconcile 类型', newChild);
    }

    return null;
  };
}

/** 得到对应的 fiber 节点 */
function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
  const clone = createWorkInProgress(fiber, pendingProps);
  clone.index = 0;
  clone.sibling = null;

  return clone;
}

/** 追踪副作用 */
export const reconcileChildFibers = ChildReconciler(true);

/** 不追踪副作用 */
export const mountChildFibers = ChildReconciler(false);
