import CustomRule from '../rule/custom-rule';
import Ruleset from '../ruleset';
import CommentNode from './comment-node';
import Element from './element';
import EndTagNode from './end-tag-node';
import GhostNode from './ghost-node';
import Node from './node';
import TextNode from './text-node';
import { SyncWalker } from './sync-walk';
import { Walker } from './walk';
export default class Document<T, O> {
    rule: CustomRule<T, O> | null;
    private _raw;
    private _tree;
    private _list;
    private _isFragment;
    private _ruleset;
    constructor(nodeTree: (Node<T, O> | GhostNode<T, O>)[], rawHtml: string, isFragment: boolean, ruleset?: Ruleset);
    readonly raw: string;
    readonly list: (Node<T, O> | GhostNode<T, O>)[];
    toString(): string;
    toJSON(): any;
    toDebugMap(): string[];
    walk(walker: Walker<T, O>): Promise<void>;
    walkOn(type: 'Node', walker: Walker<T, O, Node<T, O>>): Promise<void>;
    walkOn(type: 'Element', walker: Walker<T, O, Element<T, O>>): Promise<void>;
    walkOn(type: 'Text', walker: Walker<T, O, TextNode<T, O>>): Promise<void>;
    walkOn(type: 'Comment', walker: Walker<T, O, CommentNode<T, O>>): Promise<void>;
    walkOn(type: 'EndTag', walker: Walker<T, O, EndTagNode<T, O>>): Promise<void>;
    syncWalk(walker: SyncWalker<T, O>): void;
    syncWalkOn(type: 'Node', walker: SyncWalker<T, O, Node<T, O>>): void;
    syncWalkOn(type: 'Element', walker: SyncWalker<T, O, Element<T, O>>): void;
    syncWalkOn(type: 'Text', walker: SyncWalker<T, O, TextNode<T, O>>): void;
    syncWalkOn(type: 'Comment', walker: SyncWalker<T, O, CommentNode<T, O>>): void;
    syncWalkOn(type: 'EndTag', walker: SyncWalker<T, O, EndTagNode<T, O>>): void;
    getNode(index: number): Node<T, O> | GhostNode<T, O> | null;
    setRule(rule: CustomRule<T, O> | null): void;
}
