import test from 'ava';
import * as markuplint from '../../../lib/';
import CustomRule from '../../../lib/rules/markuplint-rule-attr-value-quotes';

const rule = new CustomRule();

test('default', async t => {
	const r = await markuplint.verify(
		`
		<div data-attr="value" data-Attr='db' data-attR=tr>
			lorem
			<p>ipsam</p>
		</div>
		`,
		{
			rules: {
				"attr-value-quotes": true,
			},
		},
		[rule],
		'en',
	);
	t.deepEqual(r, [
		{
			level: 'warning',
			message: 'Attribute value is must quote on double quotation mark',
			line: 2,
			col: 25,
			raw: 'data-Attr=\'db\'',
		},
		{
			level: 'warning',
			message: 'Attribute value is must quote on double quotation mark',
			line: 2,
			col: 40,
			raw: 'data-attR=tr',
		}
	]);
});

test('double', async t => {
	const r = await markuplint.verify(
		`
		<div data-attr="value" data-Attr='db' data-attR=tr>
			lorem
			<p>ipsam</p>
		</div>
		`,
		{
			rules: {
				"attr-value-quotes": ['error', 'double'],
			},
		},
		[rule],
		'en',
	);
	t.deepEqual(r, [
		{
			level: 'warning',
			message: 'Attribute value is must quote on double quotation mark',
			line: 2,
			col: 25,
			raw: 'data-Attr=\'db\'',
		},
		{
			level: 'warning',
			message: 'Attribute value is must quote on double quotation mark',
			line: 2,
			col: 40,
			raw: 'data-attR=tr',
		}
	]);
});

test('single', async t => {
	const r = await markuplint.verify(
		`
		<div data-attr="value" data-Attr='db' data-attR=tr>
			lorem
			<p>ipsam</p>
		</div>
		`,
		{
			rules: {
				"attr-value-quotes": ['error', 'single'],
			},
		},
		[rule],
		'en',
	);
	t.deepEqual(r, [
		{
			level: 'warning',
			message: 'Attribute value is must quote on single quotation mark',
			line: 2,
			col: 7,
			raw: 'data-attr="value"',
		},
		{
			level: 'warning',
			message: 'Attribute value is must quote on single quotation mark',
			line: 2,
			col: 40,
			raw: 'data-attR=tr',
		}
	]);
});

test('noop', t => t.pass());
