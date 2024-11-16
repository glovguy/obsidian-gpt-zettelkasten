import { App } from "obsidian";

export const DEFAULT_NOTE_GROUPS: Array<NoteGroup> = [{
  name: "Permanent Notes",
  notesFolder: null,
  copilotPrompt: 'The following is a Zettelkasten note written by the user. The note should have 1. a clear title, 2. a single, clear thought stated briefly, 3. links to relevant ideas.\nSuggest revisions for this note. Be very brief and concise. Imitate their writing style. If you show an example of the suggested edits, wrap them in a <note></note> tag. If you want to suggest splitting into multiple notes, use more than one <note></note> tag.',
},{
  name: "Literature Notes",
  notesFolder: null,
  copilotPrompt: 'The following is a Zettelkasten note written by the user. The note should have 1. a clear title, 2. a single, clear thought stated briefly, 3. links to relevant ideas.\nSuggest revisions for this note. Be very brief and concise. Imitate their writing style. If you show an example of the suggested edits, wrap them in a <note></note> tag. If you want to suggest splitting into multiple notes, use more than one <note></note> tag.',
}];

export interface NoteGroup {
  name: string;
  notesFolder: string | null;
  copilotPrompt: string;
};

export const filesInGroupFolder = (app: App, group: NoteGroup) => {
  if (!group.notesFolder) {
    return [];
  }
  return app.vault.getFiles().filter((file) => {
    const path = file.path.toLowerCase();
    return path.startsWith(group.notesFolder!.toLowerCase());
  });
};
