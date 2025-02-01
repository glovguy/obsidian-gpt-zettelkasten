import { useEffect, useRef, useState } from 'react';
import { Notice, Component, MarkdownRenderer, App, MarkdownView, ItemView } from 'obsidian';
import ZettelkastenLLMToolsPlugin from '../main';
import { VectorSearchResult } from './vector_storage';
import { CopyIcon } from './icon';
import ReactMarkdown from 'react-markdown';

const TRUNCATED_CONTENT_LENGTH = 400;

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
    searchTab: ItemView,
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
      {results.slice(0, resultShowNum).map((result) => {
        if (!result.content) { return; }
        const truncatedContent = result.content.slice(0, TRUNCATED_CONTENT_LENGTH);
        const isTruncated = result.content.length > TRUNCATED_CONTENT_LENGTH;
        return (
          <div key={result.storedVector.sha} className="search-result-container" >
            <div>
              <a className="search-result-linktext" onClick={() => onClickNoteLink(result)}>
                {'[[' + result.storedVector.linktext + ']]'}
              </a>
              <button className="search-result-copy-button" onClick={() => copyToClipboard("[[" + result.storedVector.linktext + "]]")}><CopyIcon></CopyIcon></button>
            </div>
            <div style={{ marginLeft: '16px' }}>
              Similarity: {result.similarity.toFixed(3)}
            </div>
            <NativeObsidianMarkdownComponent
              app={plugin.app}
              rawTextToRender={truncatedContent}
              filePathOfTheContent={result.storedVector.path}
              view={searchTab as unknown as MarkdownView}
            />
            {isTruncated && <p className="search-result-content">...</p>}
          </div>
        )
      })}
      <div className="search-results-show-more-container">
        <button className="search-results-show-more-button" onClick={() => setResultShowNum(resultShowNum + 5)}>Show More</button>
      </div>
    </div>
  );
};

const NativeObsidianMarkdownComponent = ({ app, rawTextToRender, filePathOfTheContent, view }: { app: App, rawTextToRender: string, filePathOfTheContent: string, view: MarkdownView }) => {
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
  }, [rawTextToRender, filePathOfTheContent]);

  return (
    <div className="markdown-preview-view" ref={containerRef} />
  );
}

export default SemanticSearchResults;
