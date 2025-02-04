import type { SvelteNode } from './svelte-parser/index.js';
import type { MLASTParentNode, MLASTPreprocessorSpecificBlock } from '@markuplint/ml-ast';
import type { ChildToken, ParseOptions, Token } from '@markuplint/parser-utils';

import { getNamespace } from '@markuplint/html-parser';
import { ParserError, Parser, AttrState } from '@markuplint/parser-utils';

import { svelteParse } from './svelte-parser/index.js';

class SvelteParser extends Parser<SvelteNode> {
	readonly specificBindDirective: ReadonlySet<string> = new Set(['group', 'this']);

	constructor() {
		super({
			endTagType: 'xml',
			tagNameCaseSensitive: true,
			ignoreTags: [
				{
					type: 'Script',
					start: '<script',
					end: '</script>',
				},
				{
					type: 'Style',
					start: '<style',
					end: '</style>',
				},
			],
			maskChar: '-',
		});
	}

	tokenize() {
		return {
			ast: svelteParse(this.rawCode),
			isFragment: true,
		};
	}

	parse(raw: string, options?: ParseOptions) {
		return super.parse(raw, {
			...options,
			ignoreFrontMatter: false,
		});
	}

	parseError(error: any) {
		if (error instanceof Error && 'start' in error && 'end' in error && 'frame' in error) {
			// @ts-ignore
			const token = this.sliceFragment(error.start.character, error.end.character);
			throw new ParserError(error.message + '\n' + error.frame, token);
		}

		return super.parseError(error);
	}

	nodeize(
		// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
		originNode: SvelteNode,
		parentNode: MLASTParentNode | null,
		depth: number,
	) {
		const token = this.sliceFragment(originNode.start, originNode.end);
		const parentNamespace =
			parentNode && 'namespace' in parentNode ? parentNode.namespace : 'http://www.w3.org/1999/xhtml';

		switch (originNode.type) {
			case 'Text': {
				return this.visitText({
					...token,
					depth,
					parentNode,
				});
			}
			case 'Comment': {
				return this.visitComment({
					...token,
					depth,
					parentNode,
				});
			}
			case 'MustacheTag': {
				return this.visitPsBlock({
					...token,
					depth,
					parentNode,
					nodeName: 'MustacheTag',
				});
			}
			case 'InlineComponent':
			case 'Element': {
				const children = originNode.children ?? [];
				const reEndTag = new RegExp(`</${originNode.name}\\s*>$`, 'i');
				const startTagEndOffset =
					children.length > 0
						? children[0]?.start ?? 0
						: token.raw.replace(reEndTag, '').length + token.startOffset;
				const startTagLocation = this.sliceFragment(token.startOffset, startTagEndOffset);

				return this.visitElement(
					{
						...startTagLocation,
						depth,
						parentNode,
						nodeName: originNode.name,
						namespace: getNamespace(originNode.name, parentNamespace),
					},
					originNode.children,
					{
						createEndTagToken: () => {
							if (!reEndTag.test(token.raw)) {
								return null;
							}
							const endTagRawMatched = token.raw.match(reEndTag);
							if (!endTagRawMatched) {
								throw new Error('Parse error');
							}
							const endTagRaw = endTagRawMatched[0];
							const endTagStartOffset = token.startOffset + token.raw.lastIndexOf(endTagRaw);
							const endTagEndOffset = endTagStartOffset + endTagRaw.length;
							const endTagLocation = this.sliceFragment(endTagStartOffset, endTagEndOffset);

							return {
								...endTagLocation,
								depth,
								parentNode,
							};
						},
					},
				);
			}
			default: {
				return this.visitExpression(
					{
						...token,
						depth,
						parentNode,
					},
					originNode,
				);
			}
		}
	}

	visitPsBlock(
		token: ChildToken & {
			readonly nodeName: string;
		},
		childNodes: readonly SvelteNode[] = [],
	): readonly [MLASTPreprocessorSpecificBlock] {
		const nodes = super.visitPsBlock(token, childNodes);
		const block = nodes.at(0);

		if (!block || block.type !== 'psblock') {
			throw new ParserError('Parse error', token);
		}

		if (nodes.length > 1) {
			throw new ParserError('Parse error', nodes.at(1)!);
		}

		return [block];
	}

	visitChildren(
		// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
		children: readonly SvelteNode[],
		parentNode: MLASTParentNode | null,
	): never[] {
		const siblings = super.visitChildren(children, parentNode);
		if (siblings.length > 0) {
			throw new ParserError('Discovered child nodes with differing hierarchy levels', siblings[0]!);
		}
		return [];
	}

	visitAttr(token: Token) {
		const attr = super.visitAttr(token, {
			quoteSet: [
				{ start: '"', end: '"', type: 'string' },
				{ start: "'", end: "'", type: 'string' },
				{ start: '{', end: '}', type: 'script' },
			],
			startState:
				// is shorthand attribute
				token.raw.trim().startsWith('{') ? AttrState.BeforeValue : AttrState.BeforeName,
		});

		if (attr.type === 'spread') {
			return attr;
		}

		let isDynamicValue = attr.startQuote.raw === '{' || undefined;

		let potentialName: string | undefined;
		let isDirective: true | undefined;
		let isDuplicatable = false;

		if (isDynamicValue && attr.name.raw === '') {
			potentialName = attr.value.raw;
		}

		const [baseName, subName] = attr.name.raw.split(':');

		if (subName) {
			isDirective = true;

			if (baseName === 'bind' && !this.specificBindDirective.has(subName)) {
				potentialName = subName;
				isDirective = undefined;
				isDynamicValue = true;
			}
		}

		if (baseName?.toLowerCase() === 'class') {
			isDuplicatable = true;

			if (subName) {
				potentialName = 'class';
				isDynamicValue = true;
			}
		}

		if (attr.startQuote.raw === '{' && attr.endQuote.raw === '}') {
			isDynamicValue = true;
		}

		return {
			...attr,
			isDynamicValue,
			isDirective,
			isDuplicatable,
			potentialName,
		};
	}

	/**
	 * > A lowercase tag, like `<div>`, denotes a regular HTML element.
	 * A capitalised tag, such as `<Widget>` or `<Namespace.Widget>`, indicates a component.
	 *
	 * @see https://svelte.io/docs/basic-markup#tags
	 * @param nodeName
	 * @returns
	 */
	detectElementType(nodeName: string) {
		return super.detectElementType(nodeName, /^[A-Z]|\./);
	}

	#traverseIfBlock(
		// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
		originBlockNode: SvelteNode,
		start?: number,
		nodeName: 'if' | 'elseif' | 'else' = 'if',
	) {
		const result: (Token & { children: SvelteNode[]; nodeName: 'if' | 'elseif' | 'else' | '/if' })[] = [];

		start = start ?? originBlockNode.start;
		const end = originBlockNode.children?.[0]?.start ?? originBlockNode.end;
		const tag = this.sliceFragment(start, end);
		const children = originBlockNode.children ?? [];

		result.push({ ...tag, children, nodeName });

		if (originBlockNode.else) {
			if (originBlockNode.else.children[0].type === 'IfBlock') {
				const elseif = this.#traverseIfBlock(originBlockNode.else.children[0], children.at(-1)?.end, 'elseif');
				result.push(...elseif);
			} else {
				const start = children.at(-1)?.end ?? originBlockNode.end;
				const end = originBlockNode.else.children[0].start;
				const tag = this.sliceFragment(start, end);
				result.push({
					...tag,
					children: originBlockNode.else.children,
					nodeName: 'else',
				});
			}
		}

		{
			const start = result.at(-1)?.children.at(-1)?.end ?? originBlockNode.end;
			const end = originBlockNode.end;
			const tag = this.sliceFragment(start, end);
			if (tag.raw) {
				result.push({ ...tag, children: [], nodeName: '/if' });
			}
		}

		return result;
	}

	visitExpression(
		token: ChildToken,
		// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
		originBlockNode: SvelteNode,
	) {
		const props = ['', 'else', 'pending', 'then', 'catch'];
		const expressions: MLASTPreprocessorSpecificBlock[] = [];

		if (originBlockNode.type === 'IfBlock') {
			const ifElseBlocks = this.#traverseIfBlock(originBlockNode);
			for (const ifElseBlock of ifElseBlocks) {
				const expression = this.visitPsBlock(
					{
						...ifElseBlock,
						depth: token.depth,
						parentNode: token.parentNode,
						nodeName: ifElseBlock.nodeName,
					},
					ifElseBlock.children,
				)[0];
				expressions.push(expression);
			}
			return expressions;
		}

		const blockType = originBlockNode.type.toLowerCase().replace('block', '');

		const nodeList = new Map<SvelteNode, string>();

		for (const prop of props) {
			let node: SvelteNode | null = (originBlockNode[prop] ?? originBlockNode) as SvelteNode;

			if (nodeList.has(node)) {
				continue;
			}

			if (node.type === 'ElseBlock' && node.children?.[0]?.elseif) {
				node = node.children[0];

				while (node != null) {
					if (!['IfBlock', 'ElseBlock'].includes(node.type)) {
						break;
					}
					const type = node.elseif ? 'elseif' : 'else';
					nodeList.set(node, type);

					node = node.else ?? node.children?.[0] ?? null;
				}
				continue;
			}

			let type = prop || blockType;
			if (prop === 'pending') {
				type = 'await';
			}

			nodeList.set(node, type);
		}

		let lastChild: SvelteNode | null = null;
		for (const [node, _type] of nodeList.entries()) {
			let type = _type;
			let start = node.start;
			let end = node.end;

			if (type === 'await') {
				start = originBlockNode.start;
			}

			end = node.children?.[0]?.start ?? end;

			if (type === 'else' && originBlockNode.type === 'EachBlock') {
				start = lastChild?.end ?? start;
			}

			if (['else', 'elseif'].includes(type) && originBlockNode.type === 'IfBlock') {
				start = lastChild?.end ?? start;
			}

			const tag = this.sliceFragment(start, end);

			if (type === 'else' && node.type === 'ElseBlock' && node.children?.[0]?.type === 'IfBlock') {
				type = 'elseif';
			}

			if (node.children && Array.isArray(node.children)) {
				lastChild = node.children.at(-1) ?? null;
			}

			if (tag.raw === '') {
				continue;
			}

			const expression = this.visitPsBlock(
				{
					...tag,
					depth: token.depth,
					parentNode: token.parentNode,
					nodeName: type,
				},
				node.children,
			)[0];
			expressions.push(expression);
		}

		const lastText = this.sliceFragment(lastChild?.end ?? originBlockNode.end, originBlockNode.end);

		if (lastText.raw) {
			// Cut before whitespace
			const index = lastText.raw.search(/\S/);
			const lastToken = this.sliceFragment(lastText.startOffset + index, originBlockNode.end);

			if (lastToken.raw) {
				const expression = this.visitPsBlock({
					...lastToken,
					depth: token.depth,
					parentNode: token.parentNode,
					nodeName: '/' + blockType,
				})[0];

				expressions.push(expression);
			}
		}

		return expressions;
	}
}

export const parser = new SvelteParser();
