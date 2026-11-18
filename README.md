<p align="center">
  <img src="https://github.com/user-attachments/assets/03564e1f-8391-4db5-b4ba-b05b4db05715" alt="Gmail Label Icons Logo" width="150">
</p>

# Gmail Label Icons

An open-source Chrome extension that lets you replace the standard icon of any Gmail label with an image of your choice, straight from the label's own menu — the same place where you pick a label color.

Google does not officially allow custom icons on labels, and the few workarounds out there require writing CSS by hand. This extension adds an **"Add image to label"** item to Gmail's label menu, so it takes two clicks and no code.

<table>
  <tr>
    <th align="center">Before</th>
    <th align="center">After</th>
  </tr>
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/c46e186f-4812-4331-9189-f8f6a85088a6" width="300" alt="Gmail labels with the default icons">
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/c84f93b4-6898-4dac-ad38-b7e466dab033" width="300" alt="Gmail labels with custom icons">
    </td>
  </tr>
</table>

---

## Features

- **Native feel:** A new item at the top of the label menu (the `▼` / three-dots button, or right-click on a label), followed by a separator, exactly where you would expect it.
- **Material 3 dialog:** The picker is styled after Gmail's own "Edit label" dialog and follows light and dark themes.
- **Two ways to add an image:** Paste an image URL (`https`) or choose a file from your computer.
- **All common formats:** `.png`, `.jpg`, `.ico`, `.svg` and `.gif` (animated GIFs keep their animation).
- **Smart state in the dialog:** An icon added from a local file locks the URL field until you remove it. An icon added by URL shows its link again when you reopen the dialog.
- **Works in every Gmail language:** The label menu is detected by its structure, not by its text.
- **Multi-language UI:** The dialog follows Gmail's display language (English and Hebrew are included, and more can be added easily — see [Adding a language](#adding-a-language)).
- **Live updates:** Changes appear instantly in all open Gmail tabs.
- **Privacy first:** Only the `storage` permission. No access to other websites, no analytics, nothing is sent anywhere.

---

## Installation

### Option 1: Download from Releases (Recommended)

1. [**Download `gmail-custom-label-icons-extension.zip` directly**](https://github.com/csh-tech/gmail-custom-label-icons-extension/releases/latest/download/gmail-custom-label-icons-extension.zip) (or visit the [**Latest Releases**](https://github.com/csh-tech/gmail-custom-label-icons-extension/releases/latest) page).
2. Unzip the file to a permanent folder on your computer (do not delete or move this folder later).
3. Open Google Chrome and go to `chrome://extensions/`.
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked** in the top-left corner.
6. Select the unzipped folder (the one that contains `manifest.json`).
7. Reload any open Gmail tabs, and you're all set!

### Option 2: Clone the Repository (For Developers)

```bash
git clone https://github.com/csh-tech/gmail-custom-label-icons-extension.git
cd gmail-custom-label-icons-extension
```

Then follow steps 3–7 above, pointing to the cloned repository folder.

---

## How to Use

1. In Gmail's left sidebar, hover over a label and click the `▼` button (or right-click the label).
2. Choose **Add image to label**.
3. Paste an image link, or click **Choose a file from your computer**.
4. Click **Save**. The icon appears immediately.

To change or remove an icon, open the same menu item again:

- **URL icons:** edit the link and save, or click **Remove image**.
- **Local file icons:** the field is locked; click **Remove image** first, then add a new one.

<table>
  <tr>
    <th align="center">1. Label Menu</th>
    <th align="center">2. Add Image Dialog</th>
  </tr>
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/98f61c19-c566-471c-8577-25a4e39bb3cd" width="260" alt="Add image to label option in Gmail label menu">
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/c2ec2bc6-6a39-4923-b861-e266201f0131" width="380" alt="The Add image to label dialog">
    </td>
  </tr>
</table>

**Tip:** Square images with a transparent background look best. Images are shown at about 20 px, so simple logos work better than detailed photos.

---

## How It Works Under the Hood

- The content script (`content.js`) listens for a click or right-click on a label control and reads the **full label name** from Gmail's own `data-label-name` attribute.
- A `MutationObserver` watches for Gmail's menus. The label menu is recognized by **structure** (a first row that opens a submenu, checkbox rows, and at least three plain rows), never by text, so it works in any Gmail language.
- The new menu item is created by cloning one of Gmail's own rows, so it inherits Gmail's styling and hover behavior, then placed at the top together with a cloned separator.
- The dialog is rendered inside a **Shadow DOM**, so Gmail's CSS cannot affect it and it cannot affect Gmail.
- Icons are saved in `chrome.storage.local`, and a dynamic `<style>` element applies them with rules like:

  ```css
  div[data-tooltip="Shopping"] .qj.aEe.qr {
    -webkit-mask: none !important;
    mask: none !important;
    background: url("...") center / contain no-repeat !important;
    background-color: transparent !important;
    opacity: 1 !important;
  }
  ```
- Files you choose are downscaled to 64 px (GIF and SVG are kept as-is) and stored as data URIs. URLs are used directly, so no download step and no extra permissions are needed.
- The background service worker has a single job: serving the translation files so the UI can follow Gmail's language.

### Project structure

```
gmail-custom-label-icons-extension/
├── manifest.json
├── content.js          # menu injection, dialog, storage, styling
├── background.js       # serves locale files to the content script
├── _locales/
│   ├── en/messages.json
│   └── he/messages.json
└── icons/              # extension icons (16, 32, 48, 128)
```

---

## Permissions and Privacy

| Permission | Why it is needed |
|---|---|
| `storage` | Save your label-to-icon choices on your computer. |
| `https://mail.google.com/*` (content script) | Add the menu item and apply icons inside Gmail only. |

- **No data leaves your machine.** Settings are stored locally with `chrome.storage.local`.
- The extension reads only **label names** from the page. It never reads email content.
- When you use an image URL, your browser loads that image from its host, like any web page would, so that host can see the request.

---

## Adding a language

The interface language follows Gmail's display language and falls back to your browser language.

1. Copy `_locales/en` to `_locales/<language-code>` (for example `_locales/fr`).
2. Translate the `message` values in `messages.json` and keep the keys unchanged.
3. Reload the extension.

Placeholders such as `$1` (the label or file name) must stay in the translated text.

---

## Alternative: No Extension (Stylus)

If you prefer not to install an extension, you can inject the same CSS with a style manager such as [Stylus](https://add0n.com/stylus.html). Create a new style that applies to URLs starting with `https://mail.google.com/` and paste:

```css
div[data-tooltip="temu"] .qj.aEe.qr {
    -webkit-mask: none !important;
    mask: none !important;
    background: url("https://www.temu.com/favicon.ico") center / contain no-repeat !important;
    background-color: transparent !important;
    opacity: 1 !important;
}
```

Change `temu` to your exact label name (case-sensitive) and the URL to your icon. For more examples and multi-language label tips, check out the standalone [CSS/Stylus repository](https://github.com/csh-tech/gmail-custom-label-icons).

---

## Known Limitations

- **DOM class dependency:** Applying icons relies on Gmail's current markup (`.qj.aEe.qr`, `div[data-tooltip]`, `.J-M` menus). If Gmail ships an interface update, the selectors may need small adjustments.
- **Match by label name:** Icons are matched by the label's exact name (case-sensitive). Renaming a label removes its icon, and labels with the same name in different Gmail accounts share the same icon.
- **Nested labels:** For nested labels, the icon is matched by the full name and by the last part of the name.
- **Per-device storage:** Icons are stored on the current browser profile only and are not synced between computers.
- **Remote images:** An icon added by URL depends on that site. Some sites block hotlinking, and if the original image is removed, the icon disappears. For a permanent icon, use a local file.
- **Desktop only:** Works on desktop Chrome and Chromium-based browsers. Gmail mobile apps are not supported.

---

## Warnings

- **Unofficial solution:** This extension is not affiliated with Google. Google may change Gmail at any time.
- **Copyright:** Make sure you have permission to use icons or images that are not yours.

---

## Contributing

Pull requests are welcome. Please open an issue first for larger changes.

## License

[MIT](LICENSE). Free and open for unrestricted use.

## Report bugs in [Issues](https://github.com/csh-tech/gmail-custom-label-icons-extension/issues) 🤝
