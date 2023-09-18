import { useState, useRef, useEffect, JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal, App, TFile, getIcon, Notice } from 'obsidian';
import ZettelkastenLLMToolsPlugin from '../main';
import { VectorSearchResult } from './vector_storage';


export default class SemanticSearchModal extends Modal {
	plugin: ZettelkastenLLMToolsPlugin;

	constructor(app: App, plugin: ZettelkastenLLMToolsPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		const {contentEl} = this;
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			contentEl.setText('No active file');
			return;
		}
		contentEl.setText('Getting embedding...');
		const activeFileVector = await this.plugin.vectorStore.upsertVector(activeFile);
		
		contentEl.setText(`Searching... ${this.plugin.vectorStore.numVectors()} entries`);
		const topMatches = this.plugin.vectorStore.vectorSearch(activeFileVector);

		await Promise.all(topMatches.map(async (match) => {
			let existingFile = this.app.vault.getAbstractFileByPath(match.storedVector.path);
			if (!existingFile || !(existingFile instanceof TFile)) { 
				// match['content'] = null;
				return;
			}

			match['content'] = this.plugin.fileFilter.filterOutMetaData(await this.app.vault.cachedRead(existingFile));
		}));

		contentEl.setText('');
		const root = createRoot(contentEl.appendChild(document.createElement('div')));
		root.render(
			<SearchResults results={topMatches}
										 activeFileLinktext={activeFileVector.linktext}
										 plugin={this.plugin}
										 modal={this} />
		);
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}


export const Icon = ({ svg }: { svg: SVGSVGElement | null }) => {
  const wrapperRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (wrapperRef.current && svg) {
      wrapperRef.current.appendChild(svg)
    }
  }, [])

  return <span ref={wrapperRef}></span>
}

const CopyIcon = () => (<Icon svg={getIcon('copy')!} />);

const SearchResults = (
	{ 
		results,
		plugin,
		activeFileLinktext,
		modal
	}: { 
		results: Array<VectorSearchResult>,
		plugin: ZettelkastenLLMToolsPlugin,
		activeFileLinktext: string,
		modal: SemanticSearchModal
	}) => {
	const [resultShowNum, setResultShowNum] = useState(5);
	const onClickNoteLink = (result: VectorSearchResult) => {
		plugin.app.workspace.openLinkText(result.storedVector.linktext, '');
		modal.close();
	}

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text)
		new Notice('Copied to clipboard');
	}

  return (
    <div>
			<h1>Results</h1>
			<span>Notes similar to {"[[" + activeFileLinktext + "]]"}</span><p />
			<span className="search-results-search-count-subheader" >Searched {plugin.vectorStore.numVectors()} entries</span><p /><p />
      {results.slice(0, resultShowNum).map((result) => {
				if (!result.content) { return; }
				return (
					<div key={result.storedVector.sha} className="search-result-container" >
						<div>
							<a className="search-result-linktext" onClick={() => onClickNoteLink(result)}>
								{'[[' + result.storedVector.linktext + ']]'}
							</a>
							<button className="search-result-copy-button" onClick={() => copyToClipboard(result.storedVector.linktext)}><CopyIcon></CopyIcon></button>
						</div>
						<div style={{ marginLeft: '16px' }}>
							Similarity: {result.similarity.toFixed(3)}
						</div>
						<p className="search-result-content" >{result.content}</p>
						
					</div>
				)
			})}
			<div className="search-results-show-more-container" >
				<button className="search-results-show-more-button" onClick={() => setResultShowNum(resultShowNum + 5)}>Show More</button>
			</div>
    </div>
  );
};
