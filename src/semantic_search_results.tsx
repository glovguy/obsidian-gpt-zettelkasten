import { useEffect, useRef, useState } from 'react';
import { Notice, MarkdownRenderer, App, MarkdownView, ItemView } from 'obsidian';
import ZettelkastenLLMToolsPlugin from '../main';
import { VectorSearchResult } from './vector_storage';
import { CopyIcon } from './icon';
import SemanticSearchTab from './semantic_search_tab';
import SemanticSearchModal from './semantic_search_modal';

const SemanticSearchResults = (
  {
    results,
    plugin,
    activeFileLinktext,
    noteLinkClickedCallback,
    searchTab,
  }: {
    results: Array<VectorSearchResult>,
    plugin: ZettelkastenLLMToolsPlugin,
    activeFileLinktext: string,
    noteLinkClickedCallback?: () => void,
    searchTab: SemanticSearchTab | SemanticSearchModal,
  }) => {
  const [resultShowNum, setResultShowNum] = useState(5);
  const onClickNoteLink = (result: VectorSearchResult) => {
    plugin.app.workspace.openLinkText(result.storedVector.linktext, '');
    if (noteLinkClickedCallback) {
      noteLinkClickedCallback();
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    new Notice('Copied to clipboard');
  }

  return (
    <div>
      <h1>Results</h1>
      <span>Notes similar to <b>{"[[" + activeFileLinktext + "]]"}</b></span><p />
      <span className="search-results-search-count-subheader" >Searched {plugin.vectorStore.numVectors()} entries</span><p /><p />
      {results.filter(r => r.content && r.content.length > 0).slice(0, resultShowNum).map((result) => {
        if (!result.content) { return; }
        return (
          <div
            key={result.storedVector.sha}
            className="search-result-container-border"
            >
            <div
              ref={(el) => {
                if (el) {
                  // Need to wait for content to render before checking overflow
                  setTimeout(() => {
                    const hasOverflow = el.scrollHeight > el.clientHeight;
                    el.classList.add(hasOverflow ? 'search-result-container-with-shadow' : 'search-result-container-without-shadow');
                  }, 0);
                }
              }}
              className="search-result-container"
              >
              <div>
                <a className="search-result-linktext" onClick={() => onClickNoteLink(result)}>
                  {'[[' + result.storedVector.linktext + ']]'}
                </a>
                <button className="search-result-copy-button" onClick={() => copyToClipboard("[[" + result.storedVector.linktext + "]]")}><CopyIcon></CopyIcon></button>
              </div>
              <div className="search-result-similarity-indicator">
                Similarity: {result.similarity.toFixed(3)}
              </div>
              <NativeObsidianMarkdownComponent
                app={plugin.app}
                rawTextToRender={result.content}
                filePathOfTheContent={result.storedVector.path}
                view={searchTab as unknown as ItemView}
              />
            </div>
          </div>
        )
      })}
      <div className="search-results-show-more-container">
        <button className="search-results-show-more-button" onClick={() => setResultShowNum(resultShowNum + 5)}>Show More</button>
      </div>
    </div>
  );
};

const NativeObsidianMarkdownComponent = ({
  app,
  rawTextToRender,
  filePathOfTheContent,
  view
}: {
  app: App,
  rawTextToRender: string,
  filePathOfTheContent: string,
  view: ItemView
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = ''; // Clean up old content

    MarkdownRenderer.render(
      app,
      rawTextToRender,
      containerRef.current,
      filePathOfTheContent,
      view
    );
  }, []);

  return (
    <div className="markdown-preview-view" ref={containerRef} />
  );
}

export default SemanticSearchResults;
