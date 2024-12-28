import ZettelkastenLLMToolsPlugin from "main";
import { Modal, App } from "obsidian";

export default class EmbeddingsOverwriteConfirmModal extends Modal {
  plugin: ZettelkastenLLMToolsPlugin;
  confirmClicked: boolean;
  confirmCallback: (confirmClicked: boolean) => void;

  constructor(app: App, plugin: ZettelkastenLLMToolsPlugin, confirmCallback: (confirmClicked: boolean) => void) {
    super(app);
    this.plugin = plugin;
    this.confirmCallback = confirmCallback;
    this.confirmClicked = false;
  }

  async onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h3", { text: "Delete existing vectors and re-index" });
    contentEl.createEl("p", {
      text: "This action will delete existing vectors and re-index using the new settings. Please confirm that this is what you would like to do."
    });
    contentEl.createEl("p", {
      text: `This will delete ${this.plugin.settings.vectors.length} vectors.`
    });

    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.gap = "10px";
    buttonContainer.style.marginTop = "20px";

    const confirmButton = buttonContainer.createEl("button", {
      text: "Confirm",
      cls: "mod-warning"
    });
    confirmButton.addEventListener("click", () => {
      this.confirmClicked = true;
      this.close();
    });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.confirmCallback(this.confirmClicked);
  }
}
