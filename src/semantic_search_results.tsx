import { useState } from 'react';
import { Notice, Component } from 'obsidian';
import ZettelkastenLLMToolsPlugin from '../main';
import { VectorSearchResult } from './vector_storage';
import { CopyIcon } from './icon';

const SemanticSearchResults = (
  {
    results,
    plugin,
    activeFileLinktext,
    noteLinkClickedCallback,
  }: {
    results: Array<VectorSearchResult>,
    plugin: ZettelkastenLLMToolsPlugin,
    activeFileLinktext: string,
    noteLinkClickedCallback?: () => void,
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
  console.log("Gets to here")

  return (
    <div>
      <h1>Results</h1>
      <span>Notes similar to <b>{"[[" + activeFileLinktext + "]]"}</b></span><p />
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

export default SemanticSearchResults;
