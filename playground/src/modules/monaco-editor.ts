export const getLanguage = (filename: string) => {
	const ext = filename.toLowerCase().split('.').pop();
	switch (ext) {
		case 'html':
		case 'htm':
			return 'html';
		case 'css':
			return 'css';
		case 'js':
		case 'cjs':
		case 'mjs':
			return 'javascript';
		case 'jsx':
			return 'javascriptreact';
		case 'ts':
		case 'cts':
		case 'mts':
			return 'typescript';
		case 'tsx':
			return 'typescriptreact';
		case 'json':
			return 'json';
		case 'yaml':
		case 'yml':
			return 'yaml';
		case 'md':
			return 'markdown';
		default:
			return;
	}
};
