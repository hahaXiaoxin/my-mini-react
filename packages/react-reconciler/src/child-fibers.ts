import { Props, ReactElement } from 'shared/react-types';
import { createFiberFromElement, createWorkInProgress, FiberNode } from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/react-symbols';
import { HostText } from './work-tags';
import { ChildDeletion, Placement } from './fiber-flags';

type ExistingChildren = Map<string | number, FiberNode>;

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

  function deleteRemainingChildren(returnFiber: FiberNode, currentFirstChild: FiberNode | null) {
    if (!shouldTrackEffects) return;

    let childToDelete = currentFirstChild;
    while (childToDelete !== null) {
      deleteChild(returnFiber, childToDelete);
      childToDelete = childToDelete.sibling;
    }
  }

  /** 处理单个元素 */
  function reconcileSingleElement(returnFiber: FiberNode, currentFiber: FiberNode | null, element: ReactElement) {
    // update 流程
    const key = element.key;
    while (currentFiber !== null) {
      // key 相同
      if (currentFiber.key === key) {
        if (element.$$typeof === REACT_ELEMENT_TYPE) {
          // type 相同
          if (currentFiber.type === element.type) {
            const existing = useFiber(currentFiber, element.props);
            existing.return = returnFiber;
            // 当前节点可复用，标记剩下节点删除
            deleteRemainingChildren(returnFiber, currentFiber.sibling);
            return existing;
          }

          // key 相同，type 不相同直接删掉所有旧的
          deleteRemainingChildren(returnFiber, currentFiber);
          break;
        }

        if (__DEV__) {
          console.warn('还未实现的 react 类型', element);
        }

        break;
      }
      // key 不相同则删掉当前节点，遍历在一个
      deleteChild(returnFiber, currentFiber);
      currentFiber = currentFiber.sibling;
    }

    // 根据 element 创建 fiber 并返回
    const fiber = createFiberFromElement(element);
    fiber.return = returnFiber;
    return fiber;
  }

  /** 处理单个文本节点 */
  function reconcileSingleTextNode(returnFiber: FiberNode, currentFiber: FiberNode | null, content: string) {
    // update
    while (currentFiber !== null) {
      if (currentFiber.tag === HostText) {
        // 类型没变可以复用
        const existing = useFiber(currentFiber, { content });
        existing.return = returnFiber;
        deleteRemainingChildren(returnFiber, currentFiber.sibling);
        return existing;
      }

      // 否则则移除
      deleteChild(returnFiber, currentFiber);
      currentFiber = currentFiber.sibling;
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

  function reconcileChildrenArray(returnFiber: FiberNode, currentFirstChild: FiberNode | null, newChild: any[]) {
    // 记录 current 中最后一个可复用的 fiber 在 current 中的索引位置，所有移动的节点最终都在这个节点的右侧
    let lastPlacedIndex: number = 0;
    // 创建的最后一个 fiber
    let lastNewFiber: FiberNode | null = null;
    // 创建的第一个 fiber
    let firstNewFiber: FiberNode | null = null;

    // 将 current 保存在 map 中
    const existingChildren: ExistingChildren = new Map();
    let current = currentFirstChild;
    while (current !== null) {
      const keyToUse = current.key !== null ? current.key : current.index;
      existingChildren.set(keyToUse, current);
      current = current.sibling;
    }

    for (let i = 0; i < newChild.length; i++) {
      // 遍历 newChild，寻找是否可复用
      const after = newChild[i];
      const newFiber = updateFromMap(returnFiber, existingChildren, i, after);

      // 更新之后是无需展示的假值时（null，false）
      if (newFiber === null) {
        continue;
      }

      // 标记移动还是插入
      newFiber.index = i;
      newFiber.return = returnFiber;

      if (lastNewFiber === null) {
        lastNewFiber = newFiber;
        firstNewFiber = newFiber;
      } else {
        lastNewFiber.sibling = newFiber;
        lastNewFiber = newFiber;
      }

      if (!shouldTrackEffects) continue;

      const current = newFiber.alternate;
      if (current !== null) {
        const oldIndex = current.index;
        if (oldIndex < lastPlacedIndex) {
          // 移动
          newFiber.flags |= Placement;
          continue;
        } else {
          // 不移动
          lastPlacedIndex = oldIndex;
        }
      } else {
        // 插入的情况
        newFiber.flags |= Placement;
      }
    }

    // 将 Map 中剩下的标记为删除
    existingChildren.forEach((fiber) => {
      deleteChild(returnFiber, fiber);
    });

    return firstNewFiber;
  }

  /**
   * 对比 existingChildren 中的节点是否可复用
   */
  function updateFromMap(returnFiber: FiberNode, existingChildren: ExistingChildren, newIndex: number, element: any): FiberNode | null {
    const keyToUse = element.key !== null ? element.key : newIndex;
    // 获取更新前获取的 fiber 节点
    const before = existingChildren.get(keyToUse);

    // 当节点是文本节点时
    if (typeof element === 'string' || typeof element === 'number') {
      // HostText
      if (before) {
        // 可复用（旧的节点也是文本节点）
        if (before.tag === HostText) {
          existingChildren.delete(keyToUse);
          return useFiber(before, { content: element + '' });
        }
      }

      return new FiberNode(HostText, { content: element + '' }, null);
    }

    // 当前节点是 ReactElement 时
    if (typeof element === 'object' && element !== null) {
      switch (element.$$typeof) {
        case REACT_ELEMENT_TYPE:
          if (before) {
            if (before.type === element.type) {
              existingChildren.delete(keyToUse);
              return useFiber(before, element.props);
            }
          }
          return createFiberFromElement(element);
      }

      // TODO 数组类型
      if (Array.isArray(element) && __DEV__) {
        console.warn('还未实现数组类型的 child');
      }
    }

    // 不可复用
    return null;
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

      if (Array.isArray(newChild)) {
        return reconcileChildrenArray(returnFiber, currentFirstChild, newChild);
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
