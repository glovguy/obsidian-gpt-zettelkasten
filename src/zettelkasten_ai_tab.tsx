import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import ZettelkastenLLMToolsPlugin from '../main';
import { NoteGroup } from './note_group';
import { VIEW_TYPE_AI_COPILOT } from './constants';
import { App } from 'obsidian';
import { useState, useEffect } from 'react';
import { availableChatModels, ChatMessage, ChatModel } from './llm_client';


const DEFAULT_SYSTEM_PROMPT = 'The following is a Zettelkasten note written by the user. The note should have 1. a clear title, 2. a single, clear thought stated briefly, 3. links to relevant ideas.\nSuggest revisions for this note. Be very brief and concise. Imitate their writing style. If you show an example of the suggested edits, wrap them in a <note></note> tag. If you want to suggest splitting into multiple notes, use more than one <note></note> tag.';

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
  const [activeFile, setActiveFile] = useState(app.workspace.getActiveFile());
  const [localSystemPrompt, setLocalSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [matchingNoteGroup, setMatchingNoteGroup] = useState<NoteGroup | undefined>(plugin.settings.noteGroups.find(group => {
    const initialActiveFile = app.workspace.getActiveFile();
    if (!group.notesFolder || !initialActiveFile) { return false; }
    return initialActiveFile.path.startsWith(group.notesFolder);
  }));
  const [availableModels, setAvailableModels] = useState<ChatModel[]>([]);

  useEffect(() => {
    const onFileChange = () => {
      const newActiveFile = app.workspace.getActiveFile();
      if (newActiveFile !== activeFile) {
        setActiveFile(newActiveFile);
        const newMatchingNoteGroup = plugin.settings.noteGroups.find(group => {
          if (!group.notesFolder || !newActiveFile) { return false; }
          return newActiveFile.path.startsWith(group.notesFolder);
        });
        setMatchingNoteGroup(newMatchingNoteGroup);
      }
    };

    app.workspace.on('active-leaf-change', onFileChange);

    return () => {
      app.workspace.off('active-leaf-change', onFileChange);
    };
  }, [activeFile, app.workspace]);

  useEffect(() => {
    setAvailableModels(availableChatModels(
      plugin.settings.openaiAPIKey,
      plugin.settings.anthropicAPIKey
    ));
  }, [plugin.settings.openaiAPIKey, plugin.settings.anthropicAPIKey]);

  const isModelAvailable = availableModels.some(model =>
    model.name === plugin.settings.copilotModel && model.available
  );

  const populateCopilotSuggest = async () => {
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
      const system_prompt = matchingNoteGroup?.copilotPrompt ?? localSystemPrompt;
      const userMessage: ChatMessage = {
        role: 'user',
        content: `<note>\n# ${activeFileTitle}\n${activeFileText}</note>${tagsMessage}`
      };

      const selectedModel = plugin.settings.copilotModel;
      let response;

      if (selectedModel.startsWith('gpt')) {
        response = await plugin.openaiClient.createMessage(
          system_prompt,
          [userMessage],
          selectedModel
        );
        setResponse(response);
      } else {
        const msg = await plugin.anthropicClient.createMessage(
          system_prompt,
          [userMessage],
          selectedModel
        );
        setResponse(msg.content[0].type === 'text' ? msg.content[0].text : JSON.stringify(msg.content[0]));
      }
    } catch (error) {
      console.error('Error calling LLM API:', error);
      setResponse('An error occurred while processing your request.');
    } finally {
      setIsLoadingResponse(false);
    }
  };

  const responseWithoutNoteTag = response.replace(/<note>([\s\S]*?)<\/note>/, '');

  return (
    <div className={!isModelAvailable ? 'is-disabled' : ''}>
      <h1>Copilot Note Suggestions</h1>
      {matchingNoteGroup !== undefined ? (
        <p><span role="img" aria-label="folder">📁</span> {matchingNoteGroup.name}</p>
      ) : (
        <>
          <p><i>(Not part of any note group)</i></p>
          <label>
            Custom System Prompt:
            <textarea
              defaultValue={DEFAULT_SYSTEM_PROMPT}
              onChange={(e) => setLocalSystemPrompt(e.target.value)}
              rows={10}
              cols={44}
            />
          </label>
          <br />
        </>
      )}
      {!isModelAvailable ? (
        <div className="notice">
          <p>⚠️ Copilot is disabled. Please configure an API key for the selected model in settings.</p>
        </div>
      ) : (
        <>
          <br />
          <button onClick={() => populateCopilotSuggest()}>Suggest Revisions</button><br />
          <hr />
          {isLoadingResponse && <span>Loading...</span>}<p></p>
          <ReactMarkdown>{responseWithoutNoteTag}</ReactMarkdown>
        </>
      )}
    </div>
  );
}
