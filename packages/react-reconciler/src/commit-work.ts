import { appendChildToContainer, Container } from 'host-config';
import { FiberNode } from './fiber';
import { Placement, MutationMask, NoFlags } from './fiber-flags';
import { HostComponent, HostRoot, HostText } from './work-tags';

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
  // flags ChildDeletion
}

function commitPlacement(finishedWork: FiberNode) {
  if (__DEV__) {
    console.warn('执行 commitPlacement', finishedWork);
  }

  // parent DOM
  const hostParent = getHostParent(finishedWork);

  if (hostParent !== null) {
    appendPlacementNodeIntoContainer(finishedWork, hostParent);
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
function appendPlacementNodeIntoContainer(finishedWork: FiberNode, hostParent: Container | null) {
  // fiber host 不可能是 hostRoot
  if (hostParent === null) {
    return;
  }

  const { tag } = finishedWork;

  if (tag === HostComponent || tag === HostText) {
    appendChildToContainer(hostParent, finishedWork.stateNode);
    return;
  }

  const child = finishedWork.child;
  if (child !== null) {
    appendPlacementNodeIntoContainer(child, hostParent);
    let sibling = child.sibling;

    while (sibling !== null) {
      appendPlacementNodeIntoContainer(sibling, hostParent);
      sibling = sibling.sibling;
    }
  }
}
