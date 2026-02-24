import { appendChildToContainer, commitUpdate, Container, insertChildToContainer, Instance, removeChild } from 'host-config';
import { FiberNode } from './fiber';
import { Placement, MutationMask, NoFlags, Update, ChildDeletion } from './fiber-flags';
import { FunctionComponent, HostComponent, HostRoot, HostText } from './work-tags';

let nextEffect: FiberNode | null = null;

export function commitMutationEffects(finishedWork: FiberNode) {
  nextEffect = finishedWork;

  while (nextEffect !== null) {
    // 向下遍历
    const child: FiberNode | null = nextEffect.child;

    if ((nextEffect.subtreeFlags & MutationMask) !== NoFlags && child !== null) {
      child.return = nextEffect;
      nextEffect = child;
    } else {
      // 向上遍历
      up: while (nextEffect !== null) {
        commitMutationEffectsOnFiber(nextEffect);
        const sibling: FiberNode | null = nextEffect.sibling;

        if (sibling !== null) {
          sibling.return = nextEffect.return;
          nextEffect = sibling;
          break up;
        }

        nextEffect = nextEffect.return;
      }
    }
  }
}

function commitMutationEffectsOnFiber(finishedWork: FiberNode) {
  const flags = finishedWork.flags;

  if ((flags & Placement) !== NoFlags) {
    commitPlacement(finishedWork);
    finishedWork.flags &= ~Placement;
  }

  // flags Update
  if ((flags & Update) !== NoFlags) {
    commitUpdate(finishedWork);
    finishedWork.flags &= ~Update;
  }

  // flags ChildDeletion
  if ((flags & ChildDeletion) !== NoFlags) {
    const deletions = finishedWork.deletions;

    if (deletions !== null) {
      deletions.forEach((child) => {
        commitDeletion(child);
      });
    }

    finishedWork.flags &= ~ChildDeletion;
  }
}

/** commit 删除操作 */
function commitDeletion(childToDelete: FiberNode) {
  // 用于指向需要删除的 fiberNode 对应的顶层，这样只需要移除一次即可
  let rootHostNode: FiberNode | null = null;

  // 递归子树
  commitNestedComponent(childToDelete, (unmountFiber) => {
    switch (unmountFiber.tag) {
      case HostComponent:
        if (rootHostNode === null) {
          rootHostNode = unmountFiber;
        }
        // TODO 解绑 ref
        return;
      case HostText:
        if (rootHostNode === null) {
          rootHostNode = unmountFiber;
        }
        return;
      case FunctionComponent:
        // TODO useEffect unmount
        return;
      default:
        if (__DEV__) {
          console.warn('未处理的 unmount 类型', unmountFiber);
        }
        break;
    }
  });

  // 移除 rootHostComponent 的 DOM
  if (rootHostNode !== null) {
    const hostParent = getHostParent(rootHostNode);
    if (hostParent !== null) {
      removeChild((rootHostNode as FiberNode).stateNode, hostParent);
    }
  }

  childToDelete.return = null;
  childToDelete.child = null;
}

/**
 * commit 删除操作
 */
function commitNestedComponent(root: FiberNode, onCommitUnmount: (fiber: FiberNode) => void) {
  // 递归子树
  let node = root;

  while (true) {
    onCommitUnmount(node);

    if (node.child !== null) {
      node.child.return = node;
      node = node.child;
      continue;
    }

    if (node === root) {
      return;
    }

    while (node.sibling === null) {
      if (node.return === null || node.return === root) {
        return;
      }

      node = node.return;
    }

    // 向上一层之后要立马切换到对应的 sibling，防止重复处理
    node.sibling.return = node.return;
    node = node.sibling;
  }
}

/** commit 插入等操作 */
function commitPlacement(finishedWork: FiberNode) {
  if (__DEV__) {
    console.warn('执行 commitPlacement', finishedWork, 'tag:', finishedWork.tag);
  }

  // parent DOM
  const hostParent = getHostParent(finishedWork);

  // host sibling
  const sibling = getHostSibling(finishedWork);

  if (__DEV__) {
    console.warn('找到 hostParent:', hostParent);
  }

  if (hostParent !== null) {
    // sibling 可能为 null，这样就直接执行append 就好了
    insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
  }
}

/** 用于查找当前 fiber 的兄弟 host 节点（在浏览器中是 dom） */
function getHostSibling(fiber: FiberNode) {
  let node: FiberNode = fiber;

  findSibling: while (true) {
    while (node.sibling === null) {
      const parent = node.return;

      if (parent === null || parent.tag === HostComponent || parent.tag === HostRoot) {
        return null;
      }

      node = parent;
    }

    node.sibling.return = node.return;
    node = node.sibling;

    while (node.tag !== HostText && node.tag !== HostComponent) {
      // 向下遍历
      if ((node.flags & Placement) !== NoFlags) {
        continue findSibling;
      }

      if (node.child === null) {
        continue findSibling;
      } else {
        node.child.return = node;
        node = node.child;
      }
    }

    if ((node.flags & Placement) === NoFlags) {
      return node.stateNode;
    }
  }
}

function getHostParent(fiber: FiberNode): Container | null {
  let parent = fiber.return;

  while (parent) {
    const parentTag = parent.tag;

    if (parentTag === HostComponent) {
      return parent.stateNode;
    }

    if (parentTag === HostRoot) {
      return parent.stateNode.container;
    }

    parent = parent.return;
  }

  if (__DEV__) {
    console.warn('未找到host parent');
  }

  return null;
}

/**
 * 将 Fiber 节点对应的 DOM 节点插入到 hostParent 中
 * 真实 DOM 修改
 */
function insertOrAppendPlacementNodeIntoContainer(finishedWork: FiberNode, hostParent: Container | null, before?: Instance) {
  // fiber host 不可能是 hostRoot
  if (hostParent === null) {
    return;
  }

  const { tag } = finishedWork;

  if (tag === HostComponent || tag === HostText) {
    if (__DEV__) {
      console.warn('appendPlacementNodeIntoContainer: 插入 DOM', finishedWork.stateNode, '到', hostParent);
    }
    if (before) {
      insertChildToContainer(finishedWork.stateNode, hostParent, before);
      return;
    }
    appendChildToContainer(hostParent, finishedWork.stateNode);
    return;
  }

  const child = finishedWork.child;
  if (child !== null) {
    insertOrAppendPlacementNodeIntoContainer(child, hostParent);
    let sibling = child.sibling;

    while (sibling !== null) {
      insertOrAppendPlacementNodeIntoContainer(sibling, hostParent);
      sibling = sibling.sibling;
    }
  }
}
