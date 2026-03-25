import { Key, Props, ReactElement, Ref } from 'shared/react-types';
import { ContextProvider, Fragment, FunctionComponent, HostComponent, WorkTag } from './work-tags';
import { Flags, NoFlags } from './fiber-flags';
import { Container } from 'host-config';
import { Lane, Lanes, NoLane, NoLanes } from './fiber-lanes';
import { Effect } from './fiber-hooks';
import { CallbackNode } from 'scheduler';
import { REACT_PROVIDER_TYPE } from 'shared/react-symbols';

export class FiberNode {
  public type: any;

  public tag: WorkTag;

  public key: Key;

  public pendingProps: Props;

  /**
   * 工作结束后确定的 props
   * todo: 留个疑问：感觉这个像是用于判断 props 是否改变过程中的旧值？
   *
   * 可以是旧的状态值，当接收一个 action，就会变成新值然后存在 memoizdedProps 之中
   * */
  public memoizdedProps: Props | null;
  /**
   * 工作结束后确定的 state
   *
   * 在 FC 之中，指向的是第一个 hook
   * */
  public memoizedState: unknown;

  public stateNode: any;

  public ref: Ref | null;

  /** 指向父 fiberNode */
  public return: FiberNode | null;

  /** 指向兄弟 fiberNode*/
  public sibling: FiberNode | null;

  /** 指向子 fiberNode*/
  public child: FiberNode | null;

  /** 表示的当前 FiberNode 在兄弟节点中的位置 */
  public index: number;

  /** 双缓冲机制中指向另一颗 Fiber 树的引用 */
  public alternate: FiberNode | null;

  public flags: Flags;

  public lanes: Lanes;
  public childLanes: Lanes;

  public subtreeFlags: Flags;

  public updateQueue: unknown;

  /** 指向需要删除的子 FiberNode*/
  public deletions: FiberNode[] | null;

  public constructor(tag: WorkTag, pendingProps: Props, key: Key) {
    // 实例 本身所需要的属性
    this.tag = tag;
    this.key = key || null;
    // HostComponent <div> div DOM
    this.stateNode = null;
    // FunctionComponent () => {}
    this.type = null;

    // 初始化 fiberNode 指针，构造树状结构
    this.return = null;
    this.sibling = null;
    this.child = null;
    this.index = 0;

    this.ref = null;

    // 作为工作单元
    this.pendingProps = pendingProps;
    this.memoizdedProps = null;
    this.memoizedState = null;
    this.updateQueue = null;

    this.alternate = null;
    // 副作用（增删改）
    this.flags = NoFlags;
    this.subtreeFlags = NoFlags;
    this.deletions = null;

    this.lanes = NoLanes;
    this.childLanes = NoLanes;
  }
}

export interface PendingPassiveEffect {
  unmount: Effect[];
  update: Effect[];
}

export class FiberRootNode {
  public container: Container;

  /** 指向当前的 FiberNode */
  public current: FiberNode;

  /** 指向已完成的 FiberNode */
  public finishedWork: FiberNode | null;

  /** 所有未被消费的 Lanes  */
  pendingLanes: Lanes;

  /** 当前正在消费的 Lane */
  finishedLane: Lane;

  /** 记录当前需要执行的副作用 */
  pendingPassiveEffect: PendingPassiveEffect;

  callbackNode: CallbackNode | null;
  callbackPriority: Lane;

  constructor(container: Container, hostRootFiber: FiberNode) {
    this.container = container;
    this.current = hostRootFiber;
    hostRootFiber.stateNode = this;
    this.finishedWork = null;
    this.pendingLanes = NoLanes;
    this.finishedLane = NoLane;

    this.callbackNode = null;
    this.callbackPriority = NoLane;

    this.pendingPassiveEffect = {
      unmount: [],
      update: []
    };
  }
}

/**
 * 接收一个 FiberNode，经过 pendingProps 之后生成一个新的 FiberNode
 */
export function createWorkInProgress(current: FiberNode, pendingProps: Props): FiberNode {
  // workInProgress，用于指向当前的工作 Fiber
  let wip = current.alternate;

  if (wip === null) {
    // mount
    wip = new FiberNode(current.tag, pendingProps, current.key);
    wip.type = current.type;
    wip.stateNode = current.stateNode;

    wip.alternate = current;
    current.alternate = wip;
  } else {
    // update
    wip.pendingProps = pendingProps;
    wip.flags = NoFlags;
    wip.subtreeFlags = NoFlags;
    wip.deletions = null;
  }

  wip.type = current.type;
  wip.updateQueue = current.updateQueue;
  wip.child = current.child;
  wip.memoizdedProps = current.memoizdedProps;
  wip.memoizedState = current.memoizedState;
  wip.ref = current.ref;
  wip.sibling = current.sibling;
  wip.return = current.return;

  return wip;
}

export function createFiberFromElement(element: ReactElement): FiberNode {
  const { type, key, props, ref } = element;

  let fiberTag: WorkTag = FunctionComponent;

  if (typeof type === 'string') {
    fiberTag = HostComponent;
  } else if (typeof type === 'object' && type.$$typeof === REACT_PROVIDER_TYPE) {
    fiberTag = ContextProvider;
  } else if (typeof type !== 'function' && __DEV__) {
    console.warn('未定义的type', element);
  }

  const fiber = new FiberNode(fiberTag, props, key);

  fiber.type = type;
  fiber.ref = ref;

  return fiber;
}

export function createFiberFromFragment(elements: any[], key: Key): FiberNode {
  const fiber = new FiberNode(Fragment, elements, key);

  return fiber;
}
