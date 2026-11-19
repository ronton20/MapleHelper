/**
 * Guided tours + "?" help guides. Each guide is a list of steps pointing at elements marked data-tour="<target>".
 * - tour: true → also runs as a guided tour the first time the page / dialog shows up (see TOUR_ORDER)
 * - steps whose target isn't on screen are skipped (mobile vs desktop layouts, empty states…)
 * - text: plain text, **bold** and line breaks are supported; it is shared by the tour and the "?" guide, so
 *   anything that only makes sense live ("try it now") goes in tourNote
 */
export interface GuideStep {
  target?: string                  // data-tour name; none → a centred message
  title: string
  text: string | ((mobile: boolean) => string)
  /** extra line only for the live guided tour ("try it now", "the guide continues…"), not in the "?" guide */
  tourNote?: string
  when?: 'mobile' | 'desktop'
  /** what interacting with the target counts as (default: click for buttons, change for form fields, else only "Got it") */
  advanceOn?: 'click' | 'change' | 'none'
  event?: string                   // window "tutorial" event fired before showing (e.g. switch a mobile tab)
  tourOnly?: boolean               // not shown in the "?" help panel
  helpOnly?: boolean               // not part of the guided tour
  nextLabel?: string
}
export interface Guide {
  title: string
  tour?: boolean
  /** belongs to a dialog: runs while that dialog is open (page guides wait / pause while any dialog is open) */
  dialog?: boolean
  steps: GuideStep[]
}

/** guided tours run in this order when several are waiting */
export const TOUR_ORDER = ['welcome', 'layout', 'add-character', 'gear', 'gear-add', 'gear-item', 'hexa']

export const GUIDES: Record<string, Guide> = {
  welcome: {
    title: 'Welcome', tour: true,
    steps: [{
      title: 'Welcome to Maple Helper 👋', tourOnly: true, nextLabel: 'Show me around',
      text: 'Track gear and HEXA progress for all your characters.\n\nThis guide shows up the first time you reach each page or feature and points at things as you go. Highlighted elements stay usable: try them, or press **Got it**.\n\nSkip it if you like. You can restart it any time in Settings, and every page has a **?** button with a short guide.',
    }],
  },

  layout: {
    title: 'Layout', tour: true,
    steps: [
      { target: 'sidebar', when: 'desktop', title: 'The sidebar', text: 'Everything starts here: switch between pages, pick a character and open Settings.' },
      { target: 'view-toggle', title: 'Gear / HEXA', advanceOn: 'none',
        text: 'Switch the selected character between the two pages:\n• **Gear**: equipment, star force, potentials and flames\n• **HEXA**: cores, levels and your upgrade path', tourNote: 'You can try it now.' },
      { target: 'settings-btn', title: 'Settings', advanceOn: 'none', text: 'Flame score weights for each character, backup and restore, sync between your devices, and restarting this tutorial.' },
      { target: 'mobile-menu', when: 'mobile', title: 'Your characters', advanceOn: 'click', text: 'Opens your character list, where you can select, reorder and add characters.', tourNote: 'Tap it to continue.' },
      { target: 'char-list', title: 'Character list', text: m => m
        ? 'Tap a character to select it. Drag the ⋮⋮ handle to change the order.'
        : 'Click a character to select it. Drag the ⋮⋮ handle to change the order. Hover a row to see its 🗑 delete button.' },
      { target: 'sidebar-footer', helpOnly: true, title: 'Bugs & ideas', text: 'Found a bug or have an idea? Copy the Discord name here and send a message.' },
      { target: 'add-char', title: 'Add a character', advanceOn: 'click', text: 'Adds a new character.', tourNote: 'Click **+** to add one. The guide continues inside the form.' },
    ],
  },

  'add-character': {
    title: 'Add a character', tour: true, dialog: true,
    steps: [
      { target: 'char-region', title: 'Region & world type', advanceOn: 'none', text: 'Where the character plays. Fetch searches this region\'s rankings, for Heroic or regular worlds.' },
      { target: 'char-name', title: 'Name & Fetch', advanceOn: 'none', text: 'Type the character name (IGN) and press **Fetch** (or Enter). Class, level, world and picture are filled in from the official GMS rankings.' },
      { target: 'char-name', title: 'Not found?', advanceOn: 'none', text: 'Fetch only finds characters listed in the rankings. If yours isn\'t there (for example a **Challenger World** character, a brand-new character, or a typo in the name), fill in the fields below yourself. Everything works the same.' },
      { target: 'char-fields', title: 'Class, level, world', advanceOn: 'none', text: 'The **class** is the important one. It decides the HEXA skills and icons, the flame score weights, and which leveling paths you can pick below. Level and world are only shown on the character.' },
      { target: 'char-image', title: 'Picture', advanceOn: 'none', text: 'Optional. Fetch fills it in, or you can paste any image link. Leave it empty to show initials.' },
      { target: 'char-hexa', title: 'HEXA leveling path', advanceOn: 'none', text: 'The setup the HEXA page starts with. Only paths for the chosen class are listed:\n• **Generic**: all your class\'s cores, no leveling order yet\n• **Saved on this device**: paths you imported or saved before\n• **Shared library**: paths other players shared (with step count), downloaded when you save\n\nYou can switch later on the HEXA page (**Change**) or import a chart image there.\n\nIt stays greyed out until a class is picked.' },
      { target: 'char-save', title: 'What\'s required', text: 'Only the **name** is required. The class is optional but strongly recommended; without it you get generic HEXA cores.', tourNote: 'Click **Add** when you\'re ready.' },
    ],
  },

  gear: {
    title: 'Gear page', tour: true,
    steps: [
      { target: 'char-header', title: 'Your character', text: 'Name, class and level. ✏️ edits the character (class, HEXA data…). ⟳ refreshes level and picture from the rankings.' },
      { target: 'gear-summary', title: 'Quick stats', text: 'Items equipped, total stars against your star goals, and how many items are still below their goal.' },
      { target: 'presets', title: 'Presets', advanceOn: 'none', text: 'Separate gear sets, for example bossing and farming. Click a preset to switch to it, **+** adds a new one, ⧉ copies the current one and 🗑 deletes it. Double-click a name (or ✏️) to rename it.' },
      { target: 'equip-grid', title: 'Equipment', advanceOn: 'none', text: 'Every slot in its in-game position.\n• Border colour = potential rank\n• ★ = star force\n• 🔥 number = flame score\nGrey numbers are still below your goal. Hover an item for a summary.' },
      { target: 'gear-totals', title: 'Gear totals', text: 'The stats that matter for your class, added up from all flames and potentials in this preset.' },
      { target: 'equip-grid', title: 'Try it', tourOnly: true, advanceOn: 'click', text: 'Click any slot to add or edit its item.' },
    ],
  },

  'gear-add': {
    title: 'Adding an item', tour: true,
    steps: [
      { target: 'item-search', title: 'Find the item', advanceOn: 'none', text: 'Type at least 2 letters. Results come from maplestory.io and only show items for this slot. Pick one to add it with its icon and level.' },
      { target: 'item-search', title: 'Not in the list?', advanceOn: 'none', text: 'Use **Add "…" as a manual item** under the results (it appears once you type). It\'s tracked the same way, just without an icon.' },
      { target: 'inspector', title: 'What you can set next', advanceOn: 'none', text: 'Once the item is in the slot, this panel lets you set (depending on the slot):\n• **Star Force** and a star goal\n• **Potential** rank and lines\n• **Flames** with a score goal\n• **Soul** (weapon only)\n• **Notes**\nYou can also swap the item or remove it.' },
    ],
  },

  'gear-item': {
    title: 'Item details', tour: true,
    steps: [
      { target: 'item-head', title: 'The item', advanceOn: 'none', text: 'Rename the item or fix its level (that sets its max ★). **Change item** swaps it, **Remove** empties the slot. For some slots (pocket, badge…) tick what this item can have.' },
      { target: 'item-stars', title: 'Star Force', advanceOn: 'none', text: 'Current stars (slider or number) and your goal, with quick goal buttons. The max follows the item level; override it if needed.' },
      { target: 'item-potential', title: 'Potential', advanceOn: 'none', text: 'Pick the rank, then up to 3 lines. Only lines possible for this slot and level are listed. **Other…** lets you type anything.' },
      { target: 'item-flame', title: 'Flames', advanceOn: 'none', text: 'Enter the bonus stats. The score uses your class\'s weights (set in Settings). Set a score goal, or pick the **Early / Mid / Late** targets.' },
      { target: 'item-soul', title: 'Soul', advanceOn: 'none', text: 'The weapon\'s soul and its option.' },
      { target: 'item-notes', title: 'Notes', advanceOn: 'none', text: 'Anything else: where it came from, your upgrade plan…' },
    ],
  },

  hexa: {
    title: 'HEXA page', tour: true,
    steps: [
      { target: 'hexa-header', title: 'HEXA', text: 'Which HEXA data this character uses and how many cores it has.' },
      { target: 'hexa-frags', title: 'Fragments', advanceOn: 'none', text: 'How many fragments you have now and how many you earn per day. They\'re used to estimate when each upgrade is affordable.' },
      { target: 'hexa-progress', title: 'Completion', text: 'Overall progress: fragments and Sol Erda spent against what\'s needed to max everything.' },
      { target: 'hexa-use-order', title: 'Leveling order available', text: 'This class\'s HEXA data includes a leveling order. **Use it** turns it on.' },
      { target: 'hexa-next', title: 'Next upgrade', text: 'The next step of your path: which core, from → to level, its cost, and when you can afford it. **Mark done** when you\'ve upgraded it in-game.' },
      { target: 'hexa-tabs', when: 'mobile', title: 'Sections', advanceOn: 'none', text: 'Switch between **Nodes** (your levels), **Path** (upgrade order) and **Image** (the chart).' },
      { target: 'hexa-nodes', event: 'hexa-tab:nodes', title: 'Nodes & levels', advanceOn: 'none', text: m => `All your HEXA cores grouped by type, with the fragments left to max each one.\n• Set the current level with − / + or type it (↑ / ↓ jump between rows)\n• Rename a node if you like; ↺ restores the official name${m ? '' : '\n• Hover a row for 🗑 to remove it'}` },
      { target: 'hexa-add-node', event: 'hexa-tab:nodes', title: 'Add or reset nodes', advanceOn: 'none', text: '**+ add node** brings back a missing core (for example a newly released one). ↺ resets the nodes and leveling order to the class\'s HEXA data; levels are kept.' },
      { target: 'hexa-path', event: 'hexa-tab:path', title: 'Upgrade path', advanceOn: 'none', text: 'Your upgrades in order, each with its fragment and Sol Erda cost and the days until you can afford it. Steps you\'ve already passed disappear. ✓ marks the next one done.' },
      { target: 'hexa-auto', event: 'hexa-tab:path', title: 'Auto', advanceOn: 'none', text: '**On**: the path comes from the leveling order and your current levels.\n**Off**: build your own checkpoint list (**+ Checkpoint**, reorder with the arrows).' },
      { target: 'hexa-order', event: 'hexa-tab:path', title: 'Order', advanceOn: 'none', text: 'View or edit the leveling order as text, one "core → level" per line.' },
      { target: 'hexa-change', event: 'hexa-tab:path', title: 'Change', advanceOn: 'none', text: 'Switch to another or a newer leveling order for this class (yours or shared). Your levels are kept.' },
      { target: 'hexa-share', event: 'hexa-tab:path', title: 'Share', advanceOn: 'none', text: 'Share your cores and leveling order with other players of your class. A path that already exists for the class isn\'t uploaded again.' },
      { target: 'hexa-image', event: 'hexa-tab:image', title: 'Leveling-order image', advanceOn: 'none', text: '**Import chart** reads a leveling-order chart image: it finds the skills, matches them to the skill bank and reads the order. You check the result before applying it. You can also drop an image onto this box.\n\nThe chart stays here to look at (zoom 1–3×, hide, ✕ remove).' },
    ],
  },

  // ---- help-only guides (the "?" button) -------------------------------------------------------
  settings: {
    title: 'Settings',
    steps: [
      { target: 'set-apis', title: 'APIs', text: '**maplestory.io version**: used for item search and icons. Raise it when new items are missing.\n**Publish key**: only needed if the shared library asks for one.' },
      { target: 'set-weights', title: 'Flame score weights', text: 'How the selected character\'s flame score is counted: main and secondary stat, ATT/MATT and all stat %. **Reset to defaults** uses the usual values for the class.' },
      { target: 'set-sync', title: 'Sync between devices', text: 'Keep your PC and phone on the same data. Enable it on one device, then pair the other with the key, link or QR code. Treat the key like a password.' },
      { target: 'set-backup', title: 'Backup', text: 'Everything is stored in this browser. **Export** a JSON backup regularly. **Import (merge)** adds a backup to your data; **Import (replace all)** overwrites it.' },
      { target: 'set-tutorial', title: 'Tutorial', text: 'Restart the guided tour from the beginning.' },
    ],
  },

  'import-chart': {
    title: 'Importing a chart', dialog: true,
    steps: [
      { target: 'imp-warn', title: 'Check the warnings', text: 'Levels are read from the image with OCR and digits can get mixed up (1↔4, 20↔2…). Skim all levels against the chart. The line with the 📚 icon says how many skills were recognised from the skill bank.' },
      { target: 'imp-skills', title: 'Skills found', text: 'One row per skill icon found in the chart.\n• ✓ = recognised from the skill bank\n• ≈ = probably that core (split or unclear icon), please check\n• Pick the right core in the dropdown if it\'s wrong or empty\n• ⇢ merges an icon variant into its skill; 🗑 removes it' },
      { target: 'imp-steps', title: 'Steps', text: 'The leveling order that was read, top to bottom. Fix levels (↑ / ↓ / Enter jump between rows); ⚠ marks unsure ones. Use the arrows, + and 🗑 to reorder, insert or remove steps. **only flagged** hides the rest.' },
      { target: 'imp-save', title: 'Save & share', text: 'Set the class and a save name to keep this path **on this device** and/or **share** it with other players of the class. A path that already exists for the class isn\'t uploaded twice.' },
      { target: 'imp-apply', title: 'Apply', text: 'Replaces this character\'s nodes and leveling order. Current levels are kept where the cores match.' },
    ],
  },

  share: {
    title: 'Sharing a setup', dialog: true,
    steps: [
      { target: 'share-summary', title: 'What gets shared', text: 'Your HEXA nodes (names and skill-bank cores) and the leveling order. Your levels and progress stay private.' },
      { target: 'share-class', title: 'Class', text: 'Players of this class will see it in the HEXA data list when they add a character or press **Change**.' },
      { target: 'share-name', title: 'Save name', text: 'A short name others will recognise, for example "Fragment-limited order".' },
      { target: 'share-btn', title: 'Share', text: 'Uploads it to the shared library. If the class already has exactly this path, you\'ll see its name instead and nothing is uploaded.' },
    ],
  },

  'change-order': {
    title: 'Changing the leveling order', dialog: true,
    steps: [
      { target: 'change-list', title: 'Available orders', text: 'Leveling orders for this class, saved on this device or shared.\n• **current**: the one you use now\n• **update available**: the shared version is newer, so **Update** downloads it\n• **Use** switches to another one\nYour levels are kept either way.' },
    ],
  },

  'order-editor': {
    title: 'Editing the leveling order', dialog: true,
    steps: [
      { target: 'order-text', title: 'One step per line', text: 'Write "core name → level", one per line. Partial names are fine. Steps you\'ve already reached are skipped automatically in the path.' },
      { target: 'order-nodes', title: 'Your node names', text: 'The names you can use, as they appear in your node list.' },
    ],
  },
}
