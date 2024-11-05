import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import ZettelkastenLLMToolsPlugin from '../main';
import { VIEW_TYPE_AI_COPILOT } from './constants';
import { App } from 'obsidian';
import { useState } from 'react';


export default class CopilotTab extends ItemView {
  plugin: ZettelkastenLLMToolsPlugin;
  root: Root;
  selectedView: string;

  constructor(leaf: WorkspaceLeaf, plugin: ZettelkastenLLMToolsPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.selectedView = "copilot";
  }

  getViewType(): string {
    return VIEW_TYPE_AI_COPILOT;
  }

  getDisplayText(): string {
    return 'AI';
  }

  getIcon(): string {
    return 'star';
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  handleFunctionChange(value: string) {
    this.selectedView = value;
    this.render();
  }

  renderSelectedView(): JSX.Element {
    const viewToRender = CopilotTabContent;
    return React.createElement(viewToRender, { plugin: this.plugin, app: this.app });
  }

  async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    this.root = createRoot(contentEl.appendChild(document.createElement('div')));
    this.root.render(
      <div>
        {this.renderSelectedView()}
      </div>
    );
  }
}

const CopilotTabContent: React.FC<{ plugin: ZettelkastenLLMToolsPlugin, app: App }> = ({ plugin, app }) => {
  const [response, setResponse] = useState('Click refresh to show suggestion');
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);

  const populateCopilotSuggest = async () => {
    let activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
      setResponse('Error loading current file...');
      return;
    }
    setIsLoadingResponse(true);
    const activeFileText = await plugin.app.vault.cachedRead(activeFile);
    const activeFileTitle = activeFile.basename;

    try {
      const tagCounts = (app.metadataCache as any).getTags(); // getTags works but is not documented
      const tags = tagCounts ? Object.keys(tagCounts) : null;
      const tagsMessage = tags ? `\ntags used in vault: ${tags.join(" ")}` : "";

      const msg = await plugin.anthropicClient.createMessage(
        'The following is a Zettelkasten note written by the user. The note should have 1. a clear title, 2. a single, clear thought stated briefly, 3. links to relevant ideas.\nSuggest revisions for this note. Be very brief and concise. Imitate their writing style. If you show an example of the suggested edits, wrap them in a <note></note> tag. If you want to suggest splitting into multiple notes, use more than one <note></note> tag.',
        [
          { role: 'user', content: `<note>\n# ${activeFileTitle}\n${activeFileText}</note>${tagsMessage}` }
        ],
        'haiku'
      );
      setResponse(msg.content[0].type === 'text' ? msg.content[0].text : JSON.stringify(msg.content[0]));
      setIsLoadingResponse(false);
    } catch (error) {
      console.error('Error calling Anthropic API:', error);
      setResponse('An error occurred while processing your request.');
      setIsLoadingResponse(false);
    }
  };

  return (
    <div>
      <h1>Copilot Note Suggestions</h1>
      <button onClick={() => populateCopilotSuggest()}>Suggest Revisions</button><br />
      <hr></hr>
      {isLoadingResponse && <span>Loading...</span>}<p></p>
      {response.includes('<note>') ? (
        <ReactMarkdown>{response.match(/<note>([\s\S]*?)<\/note>/)?.[1] || ''}</ReactMarkdown>
      ) : (
        <ReactMarkdown>{response}</ReactMarkdown>
      )}
    </div>
  );
}
