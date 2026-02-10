# Caret - Frontend Design & Implementation Guide

**Philosophy: "Swiss Focus"**

The interface must be rigorous, grid-based, and minimal. Content comes first; UI is secondary. The aesthetic mimics high-end digital paper, creating a distraction-free environment for collaborative writing.

---

## 1. Color Palette

Implement these colors as CSS variables and Tailwind extensions.

### Light Mode (Default)

| Semantic Name | Hex Value | Usage Rule |
|:-------------|:----------|:-----------|
| **bg-app** | `#FAFAFA` | Global application background (Off-White). Reduces eye strain compared to pure white. |
| **bg-surface** | `#FFFFFF` | The actual document "sheet" or active cards. |
| **text-primary** | `#1A1A1A` | Main content, headings. High contrast, but not absolute black. |
| **text-secondary** | `#6E6E73` | UI labels, inactive states, metadata (Slate Gray). |
| **accent-main** | `#0066CC` | **Primary Brand Color (Deep Blue).** Reminiscent of Word/Google Docs. Used for primary buttons and links. |
| **accent-caret** | `#FF4500` | **Signature Brand Color (International Orange).** Used EXCLUSIVELY for the text caret (cursor). Represents user focus. |
| **accent-ai** | `#8B5CF6` | **AI Identity Color (Purple).** Exclusively for AI-related features. |
| **ai-highlight** | `#F5F6F8` | Background for AI-generated text (Subtle Cool Gray/Lavender). Improves readability. |
| **text-ghost** | `#A3A3A3` | **AI Suggestion Text.** For inline "ghost" text suggestions (Copilot style). |
| **diff-add-bg** | `#DCFCE7` | Subtle green background for AI additions. |
| **diff-del-bg** | `#FEE2E2` | Subtle red background for AI deletions. |
| **diff-del-text** | `#B91C1C` | Text color for deletions (with line-through). |
| **border-subtle** | `#E5E5E5` | For separating UI panels without visual noise. |
| **success** | `#10B981` | Success states, confirmations. |
| **warning** | `#F59E0B` | Warning states, alerts. |
| **error** | `#EF4444` | Error states, destructive actions. |

### Dark Mode

| Semantic Name | Hex Value | Usage Rule |
|:-------------|:----------|:-----------|
| **bg-app** | `#121212` | Global application background (True Dark). |
| **bg-surface** | `#1E1E1E` | Document "sheet" or active cards (elevated surface). |
| **text-primary** | `#E8E8E8` | Main content, headings. High contrast. |
| **text-secondary** | `#9CA3AF` | UI labels, inactive states, metadata. |
| **accent-main** | `#3B99FC` | Brighter blue for dark backgrounds (maintains brand identity). |
| **accent-caret** | `#FF6B35` | Slightly softer orange for the caret in dark mode. |
| **accent-ai** | `#A78BFA` | Lighter purple for AI features in dark mode (better contrast). |
| **ai-highlight** | `#202124` | Background for AI-generated text in dark mode (Deep Gray/Lavender). |
| **text-ghost** | `#525252` | AI Suggestion Text in dark mode. |
| **diff-add-bg** | `#064E3B` | Subtle green background for AI additions in dark mode. |
| **diff-del-bg** | `#7F1D1D` | Subtle red background for AI deletions in dark mode. |
| **diff-del-text** | `#F87171` | Text color for deletions in dark mode. |
| **border-subtle** | `#2A2A2A` | Panel separators. |
| **success** | `#34D399` | Success states (brighter for visibility). |
| **warning** | `#FBBF24` | Warning states (brighter). |
| **error** | `#F87171` | Error states (brighter). |

### Theme Toggle Strategy

- **Default Behavior**: Respect system preference (`prefers-color-scheme`)
- **Manual Toggle**: Persist user choice in `localStorage` under `caret-theme`
- **Transition**: Smooth theme switch with `transition: background-color 200ms ease`

---

## 2. Typography Strategy

### Font Families

- **UI Font**: `Inter`. Tight tracking, clean, utilitarian.
- **Document Font**: `Merriweather`. Elegant serif for the actual writing canvas to differentiate "writing mode" from "coding mode".
- **Monospace** (for code blocks): `Fira Code`.

### Type Scale & Hierarchy

| Element | Font | Size | Line Height | Weight | Tracking | Usage |
|:--------|:-----|:-----|:------------|:-------|:---------|:------|
| **Display (H1)** | Document | 32px | 1.3 | 400 | -0.02em | Document title, main heading |
| **Heading (H2)** | Document | 28px | 1.3 | 400 | -0.02em | Section headings |
| **Subheading (H3)** | Document | 24px | 1.4 | 400 | -0.02em | Subsections |
| **Body Text** | Document | 18px | 1.7 | 400 | normal | Main document content |
| **UI Large** | UI | 16px | 1.5 | 500 | normal | Primary buttons, important labels |
| **UI Base** | UI | 14px | 1.5 | 400 | normal | Default UI text, menu items |
| **UI Small** | UI | 12px | 1.4 | 400 | 0.02em | Captions, metadata, timestamps |
| **Code** | Monospace | 14px | 1.6 | 400 | normal | Code blocks, inline code |

### Text Rendering

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

---

## 3. Grid System & Spacing Scale

### Base Unit: 4px

All spacing follows a 4px base unit for visual consistency.

| Token | Value | Usage |
|:------|:------|:------|
| `space-0` | 0px | No spacing |
| `space-1` | 4px | Tight spacing (icon padding) |
| `space-2` | 8px | Small gaps (button padding) |
| `space-3` | 12px | Default gaps |
| `space-4` | 16px | Standard spacing (card padding) |
| `space-6` | 24px | Medium spacing (section margins) |
| `space-8` | 32px | Large spacing (page margins) |
| `space-12` | 48px | Extra-large spacing |
| `space-16` | 64px | Page-level spacing |

### Layout Grid

- **Document Max-Width**: 800px (optimal reading line length: 60-80 characters)
- **AI Chat Panel Width**: 400px (desktop)
- **Gutter**: 24px (space between major UI sections)

### Responsive Breakpoints

| Breakpoint | Min Width | Usage |
|:-----------|:----------|:------|
| `mobile` | 0px | Default mobile-first |
| `tablet` | 768px | Tablet layouts |
| `desktop` | 1024px | Desktop with sidebar |
| `wide` | 1440px | Large displays |

---

## 4. Z-Index Layers

A strict layering system ensures that interactive elements like the Caret, AI diffs, and floating panels never overlap incorrectly.

| Layer | Value | Usage |
|:------|:------|:------|
| **z-0** | 0 | **Document Surface**: The base writing canvas |
| **z-10** | 10 | **Decorators**: Text highlights, AI diff backgrounds, search matches |
| **z-20** | 20 | **Collaboration**: Carets, user name labels, selection highlights |
| **z-30** | 30 | **Chrome**: Sticky headers, toolbars, navigation bars |
| **z-40** | 40 | **Floating UI**: AI Chat Panel, Context Menus, Dropdowns |
| **z-50** | 50 | **Overlays**: Modals, Dialogs, Backdrop filters |
| **z-100** | 100 | **Utility**: Tooltips, Toast notifications, System alerts |

---

## 5. Border Radius (Swiss Scale)

To maintain the rigorous, grid-based "Swiss" aesthetic, we avoid overly rounded "bubble" corners. Corners should be tight and precise.

| Token | Value | Usage |
|:------|:------|:------|
| `radius-none` | 0px | Sharp corners for the main document canvas |
| `radius-sm` | 2px | Small UI elements (checkboxes, tooltips) |
| `radius-base` | 4px | **Standard** (Buttons, Input fields, Tabs) |
| `radius-md` | 6px | Cards, Modals, AI Chat Panel |
| `radius-lg` | 8px | Large containers (rarely used) |
| `radius-full` | 9999px | Circular avatars only |

---

## 5. Shadows & Elevation

Use shadows sparingly to maintain the minimal aesthetic.

| Level | CSS Shadow | Usage |
|:------|:-----------|:------|
| **none** | `box-shadow: none;` | Flat elements, document surface |
| **subtle** | `box-shadow: 0 1px 3px rgba(0,0,0,0.08);` | Context menus, dropdowns |
| **elevated** | `box-shadow: 0 4px 12px rgba(0,0,0,0.12);` | Modals, floating panels |
| **strong** | `box-shadow: 0 8px 24px rgba(0,0,0,0.16);` | Drag-and-drop shadows |

**Dark Mode Adjustment**: Increase opacity by 0.1 for visibility.

---

## 5. Iconography

### Icon Library: Lucide React

### Size Standards

| Size | Value | Usage |
|:-----|:------|:------|
| `xs` | 12px | Inline icons in text |
| `sm` | 16px | UI buttons, menu items |
| `base` | 20px | Default toolbar icons |
| `lg` | 24px | Primary actions |
| `xl` | 32px | Empty states, onboarding |

### Style Guidelines

- **Weight**: Use `stroke-width={2}` for most icons.
- **Color**: Inherit from parent text color (`currentColor`).
- **Active State**: Apply `accent-main` or `accent-ai` color depending on context.
- **Spacing**: 8px gap between icon and text label.

---

## 6. Internationalization (i18n)

### Language Support

- **Primary Language**: English (en-US)
- **Additional Languages**: Spanish (es), French (fr), German (de), Portuguese (pt)
- **Fallback Strategy**: If a translation is missing, fall back to English

### Implementation

- **Library**: `react-i18next` (React integration for i18next)
- **Storage**: Store user language preference in `localStorage` under `caret-language`
- **Detection**: Auto-detect from browser locale (`navigator.language`) on first visit
- **Switching**: Language selector in settings menu (flag icon + dropdown)

### Translation Coverage

| Area | Translatable Elements |
|:-----|:----------------------|
| **UI Labels** | Buttons, menu items, tooltips, placeholders |
| **AI Interface** | Chat prompts, suggestions, error messages |
| **Notifications** | Toast messages, confirmations, warnings |
| **Onboarding** | Welcome screens, tutorials, hints |
| **Accessibility** | ARIA labels, screen reader text |

### File Structure

```
src/
├── locales/
│   ├── en-US/
│   │   ├── common.json       # Shared UI labels
│   │   ├── editor.json       # Editor-specific text
│   │   ├── ai.json           # AI chat interface
│   │   └── errors.json       # Error messages
│   ├── es/
│   │   └── ...
│   └── fr/
│       └── ...
```

### Key Considerations

- **RTL Support**: Not in MVP, but architecture should support future RTL languages (Arabic, Hebrew)
- **Date/Time Formatting**: Use `Intl.DateTimeFormat` for locale-aware formatting
- **Number Formatting**: Use `Intl.NumberFormat` for currencies and numbers
- **Plural Rules**: Use i18next pluralization for proper grammar (e.g., "1 document" vs "2 documents")

---

## 7. Key UI Behaviors

### The "Caret" Identity

The text input cursor styled with `caret-color: #FF4500;` (Light Mode) or `#FF6B35` (Dark Mode). This **International Orange** caret is the signature of the brand. While the Blue UI represents the tool and Purple represents the AI, the Orange Caret represents the user's active focus and presence.

### Minimal Chrome

Sidebar and toolbars blend into `bg-app`. Use whitespace to separate elements rather than heavy borders.

### Focus Mode

When the user is typing, peripheral UI fades to 20% opacity over 200ms, leaving only:
- The document surface (`bg-surface`)
- The orange caret
- Essential editing tools

**Trigger**: 2 seconds after last cursor/scroll activity

### Glassmorphism (Subtle)

Use translucent backgrounds for overlays:

```css
.glass-panel {
  background: rgba(250, 250, 250, 0.85); /* Light mode */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(229, 229, 229, 0.6);
}
```

---

## 8. Component Architecture

### Core Layout Structure

```
┌─────────────────────────────────────────────────────┐
│ Top Bar (fixed, height: 56px)                      │
│ [Logo] [Document Title] [Collab Avatars] [Menu]    │
├─────────────────────┬───────────────────────────────┤
│                     │ AI Chat Panel (collapsible)  │
│  Document Editor    │ width: 400px (desktop)        │
│  max-width: 800px   │ [Chat History]                │
│                     │ [Input Field]                 │
│  [Rich Text Area]   │ [Context Display]             │
│                     │                               │
│                     │                               │
└─────────────────────┴───────────────────────────────┘
```

### AI Chat Panel Specifications

- **Width**: 400px (desktop), full-width (mobile)
- **Position**: Fixed right sidebar
- **Collapse**: Slide-out animation (250ms ease)
- **Keyboard Shortcut**: `Cmd+K` / `Ctrl+K` to toggle
- **State Persistence**: Remember open/closed state in `localStorage`
- **Branding**: Use `accent-ai` (purple) for all AI-specific UI elements (header background, action buttons, streaming indicators)

**Chat Interface Components**:
1. **Header**: "Caret" title + close button (background: `accent-ai`)
2. **Message History**: Scrollable area with user/AI messages
3. **Input Field**: Multi-line textarea with auto-resize
4. **Context Tags**: Show referenced document sections as chips
5. **Streaming Indicator**: Animated dots in `accent-ai` color during AI response

### Document Tabs

- **Style**: Minimal tabs similar to browser tabs
- **Max Width**: 200px per tab with text truncation
- **Close Button**: Visible on hover
- **New Tab**: `+` button at the end
- **Drag & Drop**: Reorderable tabs

### Context Menu (Text Selection)

- **Trigger**: Appears on text selection
- **Position**: Floating above selection, centered
- **Actions**: Bold, Italic, Link, AI Enhance, Ask AI
- **Style**: Glassmorphism panel with `shadow-elevated`
- **Dismiss**: Click outside or Escape key

### Real-time Collaboration UI

#### User Presence Avatars

- **Position**: Top-right corner
- **Size**: 32px circular avatars
- **Max Visible**: 5 users, "+N more" indicator
- **Hover**: Show full name tooltip

#### Live Cursors

- **Style**: Colored vertical line (2px width) with user name label
- **Colors**: Assign from predefined palette (hsl based)
- **Animation**: Smooth position transition (100ms)

#### Edit Indicators

- **Style**: Subtle highlight with user's color at 20% opacity
- **Duration**: Fade out after 2 seconds

### Notifications & Feedback

#### Toast System

- **Position**: Bottom-right corner, 24px from edges
- **Max Width**: 400px
- **Auto-dismiss**: 4 seconds (configurable per type)
- **Types**:
  - Success: Green left border + checkmark icon
  - Error: Red left border + X icon
  - Info: Blue left border + info icon
- **Stack**: Maximum 3 toasts, newest on top

#### AI Processing States

- **Inline Spinner**: Small circular spinner (16px) next to "AI is writing..."
- **Progress Bar**: Linear progress for batch operations
- **Skeleton Loading**: Placeholder lines for expected AI content

#### Error States

- **Visual**: Subtle red border (`error` color) + icon
- **Message**: Clear, actionable error text
- **Actions**: Retry button or dismiss option

---

## 9. Animation & Transitions

### Principles

- **Smooth**: Animations should feel natural, not jarring
- **Fast**: Keep durations under 300ms to avoid perceived lag
- **Purposeful**: Every animation should communicate state or guide attention

### Timing Functions

| Function | Bezier | Usage |
|:---------|:-------|:------|
| **ease-out** | `cubic-bezier(0.4, 0.0, 0.2, 1)` | Elements entering (modals, panels) |
| **ease-in** | `cubic-bezier(0.4, 0.0, 1, 1)` | Elements exiting |
| **ease-in-out** | `cubic-bezier(0.4, 0.0, 0.6, 1)` | State transitions |

### Duration Standards

| Interaction | Duration | Function |
|:------------|:---------|:---------|
| Hover state | 150ms | ease-out |
| Focus state | 150ms | ease-out |
| Button press | 100ms | ease-in-out |
| Panel open/close | 250ms | ease-out |
| Page transitions | 300ms | ease-in-out |
| Toast enter/exit | 200ms | ease-out |

### Special Animations

#### AI Text Streaming

```javascript
// Character-by-character reveal with slight easing
const streamText = (text, element) => {
  const chars = text.split('');
  let index = 0;
  
  const interval = setInterval(() => {
    element.textContent += chars[index];
    index++;
    if (index >= chars.length) clearInterval(interval);
  }, 30); // 30ms per character
};
```

#### Focus Mode Transition

```css
.ui-peripheral {
  transition: opacity 200ms ease-out;
}

.focus-mode .ui-peripheral {
  opacity: 0.2;
}
```

---

## 10. Interactive States

Define visual feedback for all interactive elements.

### Button States

| State | Visual Change | Cursor |
|:------|:--------------|:-------|
| **Default** | `bg-accent-main`, `text-white` | pointer |
| **Hover** | Darken by 10% (`filter: brightness(0.9)`) | pointer |
| **Active/Pressed** | Darken by 20% + scale(0.98) | pointer |
| **Disabled** | `opacity: 0.4`, no hover effect | not-allowed |
| **Loading** | Spinner icon, disabled interaction | default |

### Link States

| State | Visual Change |
|:------|:--------------|
| **Default** | `color: accent-main`, no underline |
| **Hover** | Underline appears (transition: 150ms) |
| **Active** | Darken by 10% |
| **Visited** | Same as default (no distinction in app context) |

### Input States

| State | Visual Change |
|:------|:--------------|
| **Default** | `border: 1px solid border-subtle` |
| **Focus** | `border-color: accent-main`, `box-shadow: 0 0 0 3px rgba(0,102,204,0.1)` |
| **Error** | `border-color: error`, red focus ring |
| **Disabled** | `bg: bg-app`, `opacity: 0.6`, no interaction |

---

## 11. AI Chat Panel States

Visual representation for each state of the AI interface.

**Note**: The header row (│ Caret [×] │) uses `accent-ai` (purple) background with white text to distinguish AI features.

### Idle State

```
┌────────────────────────────────┐
│ Caret               [×] │
├────────────────────────────────┤
│                                │
│   💡 Suggested Prompts:        │
│   • Summarize this document    │
│   • Improve the introduction   │
│   • Check for clarity          │
│                                │
│   Recent Conversations         │
│   📄 "Sales Proposal Review"   │
│   📄 "Blog Post Draft"         │
│                                │
└────────────────────────────────┘
│ [Type a message...]      [→]  │
└────────────────────────────────┘
```

### Active Conversation

```
┌────────────────────────────────┐
│ Caret               [×] │
├────────────────────────────────┤
│ You: Improve this paragraph    │
│ [Document Reference Chip]      │
│                                │
│ AI: I'll help you refine...    │
│ [AI response content]          │
│                                │
│ You: Make it more concise      │
│                                │
│ AI: Here's a shorter version..│
│ [Apply] [Regenerate]           │
│                                │
└────────────────────────────────┘
│ [Type a message...]      [→]  │
└────────────────────────────────┘
```

### Streaming State

```
┌────────────────────────────────┐
│ Caret               [×] │
├────────────────────────────────┤
│ You: Write an intro for this   │
│                                │
│ AI: Here's a compelling intro  │
│ for your document. The key     │
│ insight is that...●●●          │
│                                │
│ [Stop Generating]              │
└────────────────────────────────┘
```

### Error State

```
┌────────────────────────────────┐
│ Caret               [×] │
├────────────────────────────────┤
│ You: Analyze this document     │
│                                │
│ ⚠️ Failed to generate response │
│ The AI service is temporarily  │
│ unavailable. Please try again. │
│                                │
│ [Retry] [Dismiss]              │
└────────────────────────────────┘
```

---

## 12. Responsive Behavior (Mobile-First)

### Mobile (<768px)

- **Layout**: Full-screen document editor
- **AI Chat Panel**: Bottom sheet modal (slide up from bottom)
- **Toolbar**: Sticky bottom toolbar with essential actions
- **Context Menu**: Full-width bottom sheet on text selection
- **Tabs**: Horizontal scroll with swipe gestures

### Tablet (768px-1024px)

- **Layout**: Split view when AI panel is open
  - 60% document editor (left)
  - 40% AI panel (right)
- **Collapsible Sidebar**: Document navigation (hamburger menu)
- **Toolbar**: Horizontal toolbar below top bar
- **Context Menu**: Floating panel (same as desktop)

### Desktop (>1024px)

- **Layout**: Full split view
  - Document editor: centered, max-width 800px
  - AI panel: fixed 400px right sidebar
- **Persistent Toggle**: AI panel toggle button in top bar
- **Keyboard Shortcuts**: Full support (Cmd+K, Cmd+B, etc.)
- **Context Menu**: Floating panel with full action set

### Wide Display (>1440px)

- **Layout**: Same as desktop, but with more breathing room
- **Document Editor**: Can expand to 900px max-width
- **Side Panels**: Can show document outline on left (optional)

---

## 13. Accessibility (WCAG AA Compliance)

### Color Contrast

All text must meet **WCAG AA** standards (4.5:1 contrast ratio for normal text, 3:1 for large text).

#### Light Mode Compliance

- `text-primary` (#1A1A1A) on `bg-surface` (#FFFFFF): **15.8:1** ✅
- `text-secondary` (#6E6E73) on `bg-app` (#FAFAFA): **4.8:1** ✅
- `accent-main` (#0066CC) on white: **4.7:1** ✅ (Meets AA for normal text)
- `accent-ai` (#8B5CF6) on white: **4.6:1** ✅ (Meets AA for normal text)

#### Dark Mode Compliance

- `text-primary` (#E8E8E8) on `bg-surface` (#1E1E1E): **12.1:1** ✅
- `text-secondary` (#9CA3AF) on `bg-app` (#121212): **6.2:1** ✅

### Keyboard Navigation

- **Tab Order**: Logical flow (top-to-bottom, left-to-right)
- **Focus Indicators**: Visible 3px ring with `accent-main` at 40% opacity
- **Shortcuts**: All critical actions accessible via keyboard
  - `Cmd+K` / `Ctrl+K`: Toggle AI panel
  - `Cmd+B` / `Ctrl+B`: Bold
  - `Cmd+I` / `Ctrl+I`: Italic
  - `Cmd+/` / `Ctrl+/`: Open command palette
  - `Esc`: Close modals/panels

### Screen Reader Support

- **ARIA Labels**: All interactive elements have descriptive labels
- **Live Regions**: Use `aria-live="polite"` for AI streaming responses
- **Landmark Roles**: Proper `main`, `nav`, `aside`, `complementary` roles
- **Alt Text**: All icons have text alternatives

### Focus Management

- **Modal Trapping**: Focus locked within modal when open
- **Auto-focus**: Input fields auto-focus when panels open
- **Return Focus**: Focus returns to trigger element after modal close

---

## 14. Design Tokens (Tailwind Configuration)

```javascript
// tailwind.config.js
export default {
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      colors: {
        // Light mode
        'app-bg': '#FAFAFA',
        'surface': '#FFFFFF',
        'text-primary': '#1A1A1A',
        'text-secondary': '#6E6E73',
        'accent': '#0066CC',
        'accent-caret': '#FF4500',
        'accent-ai': '#8B5CF6',
        'ai-highlight': '#F5F6F8',
        'text-ghost': '#A3A3A3',
        'diff-add-bg': '#DCFCE7',
        'diff-del-bg': '#FEE2E2',
        'diff-del-text': '#B91C1C',
        'border-subtle': '#E5E5E5',
        
        // Status colors
        'success': '#10B981',
        'warning': '#F59E0B',
        'error': '#EF4444',
        
        // Dark mode (via CSS variables)
        'dark': {
          'app-bg': '#121212',
          'surface': '#1E1E1E',
          'text-primary': '#E8E8E8',
          'text-secondary': '#9CA3AF',
          'accent': '#3B99FC',
          'accent-caret': '#FF6B35',
          'accent-ai': '#A78BFA',
          'ai-highlight': '#202124',
          'text-ghost': '#525252',
          'diff-add-bg': '#064E3B',
          'diff-del-bg': '#7F1D1D',
          'diff-del-text': '#F87171',
          'border-subtle': '#2A2A2A',
        }
      },
      zIndex: {
        '0': '0',
        '10': '10',
        '20': '20',
        '30': '30',
        '40': '40',
        '50': '50',
        '100': '100',
      },
      borderRadius: {
        'none': '0',
        'sm': '2px',
        'base': '4px',
        'md': '6px',
        'lg': '8px',
        'full': '9999px',
      },
      fontFamily: {
        'ui': ['Inter', 'Geist Sans', 'system-ui', 'sans-serif'],
        'document': ['Merriweather', 'Newsreader', 'Georgia', 'serif'],
        'mono': ['Fira Code', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'display': ['32px', { lineHeight: '1.3', fontWeight: '700' }],
        'h2': ['28px', { lineHeight: '1.3', fontWeight: '600' }],
        'h3': ['24px', { lineHeight: '1.4', fontWeight: '600' }],
        'body': ['18px', { lineHeight: '1.7', fontWeight: '400' }],
        'ui-lg': ['16px', { lineHeight: '1.5', fontWeight: '500' }],
        'ui-base': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'ui-sm': ['12px', { lineHeight: '1.4', fontWeight: '400' }],
      },
      spacing: {
        '0': '0px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '6': '24px',
        '8': '32px',
        '12': '48px',
        '16': '64px',
      },
      boxShadow: {
        'subtle': '0 1px 3px rgba(0,0,0,0.08)',
        'elevated': '0 4px 12px rgba(0,0,0,0.12)',
        'strong': '0 8px 24px rgba(0,0,0,0.16)',
      },
      transitionTimingFunction: {
        'ease-out-custom': 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        'ease-in-custom': 'cubic-bezier(0.4, 0.0, 1, 1)',
      },
      transitionDuration: {
        'fast': '150ms',
        'base': '200ms',
        'medium': '250ms',
        'slow': '300ms',
      },
      maxWidth: {
        'document': '800px',
        'chat-panel': '400px',
      },
      backdropBlur: {
        'glass': '12px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
  ],
}
```

### CSS Variables for Theme Switching

```css
/* globals.css */
:root {
  /* Light mode (default) */
  --color-app-bg: 250 250 250;
  --color-surface: 255 255 255;
  --color-text-primary: 26 26 26;
  --color-text-secondary: 110 110 115;
  --color-accent: 0 102 204;
  --color-accent-caret: 255 69 0; /* #FF4500 */
  --color-accent-ai: 139 92 246;
  --color-ai-highlight: 245 246 248; /* #F5F6F8 */
  --color-text-ghost: 163 163 163; /* #A3A3A3 */
  --color-diff-add-bg: 220 252 231; /* #DCFCE7 */
  --color-diff-del-bg: 254 226 226; /* #FEE2E2 */
  --color-diff-del-text: 185 28 28; /* #B91C1C */
  --color-border-subtle: 229 229 229;
}

.dark {
  /* Dark mode overrides */
  --color-app-bg: 18 18 18;
  --color-surface: 30 30 30;
  --color-text-primary: 232 232 232;
  --color-text-secondary: 156 163 175;
  --color-accent: 59 153 252;
  --color-accent-caret: 255 107 53; /* #FF6B35 */
  --color-accent-ai: 167 139 250;
  --color-ai-highlight: 32 33 36; /* #202124 */
  --color-text-ghost: 82 82 82; /* #525252 */
  --color-diff-add-bg: 6 78 59; /* #064E3B */
  --color-diff-del-bg: 127 29 29; /* #7F1D1D */
  --color-diff-del-text: 248 113 113; /* #F87171 */
  --color-border-subtle: 42 42 42;
}

/* Smooth theme transitions */
* {
  transition: background-color 200ms ease, color 200ms ease, border-color 200ms ease;
}
```

---

## 15. Component Library Structure

Organize React components following this structure:

```
src/
├── components/
│   ├── ui/                 # Reusable UI primitives
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Toast.tsx
│   │   ├── Modal.tsx
│   │   └── ...
│   ├── editor/             # Tiptap editor components
│   │   ├── Editor.tsx
│   │   ├── Toolbar.tsx
│   │   ├── ContextMenu.tsx
│   │   └── extensions/
│   ├── ai/                 # AI-related components
│   │   ├── ChatPanel.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── StreamingText.tsx
│   │   └── ContextDisplay.tsx
│   ├── collab/             # Collaboration UI
│   │   ├── UserAvatars.tsx
│   │   ├── LiveCursor.tsx
│   │   └── PresenceIndicator.tsx
│   └── layout/             # Layout components
│       ├── TopBar.tsx
│       ├── DocumentTabs.tsx
│       └── MainLayout.tsx
├── hooks/                  # Custom React hooks
│   ├── useTheme.ts
│   ├── useCollaboration.ts
│   └── useAI.ts
├── styles/
│   ├── globals.css
│   └── tailwind.config.js
└── utils/
    ├── theme.ts
    └── animation.ts
```

---

## 16. Performance Considerations

### Code Splitting

- Lazy-load the AI Chat Panel (`React.lazy`) to reduce initial bundle size
- Split editor extensions by feature (tables, images, etc.)

### Image Optimization

- Use WebP format with fallbacks
- Implement lazy loading for user avatars
- Optimize SVG icons (remove unnecessary metadata)

### Animation Performance

- Use `transform` and `opacity` for animations (GPU-accelerated)
- Avoid animating `width`, `height`, or `left/top`
- Use `will-change` sparingly for elements that animate frequently

### Font Loading Strategy

```css
/* Preload critical fonts */
<link rel="preload" href="/fonts/Inter-Regular.woff2" as="font" type="font/woff2" crossorigin>

/* Use font-display: swap */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-Regular.woff2') format('woff2');
  font-display: swap;
}
```

---

## 16. Frontend Architecture (Clean Architecture)

We follow a strict separation of concerns based on Feature-Sliced Design principles tailored for React to ensure the codebase remains scalable and maintainable.

### The 3-Layer Model

1.  **Presentation Layer (UI)**: Pure React components.
    *   **Rule**: NO complex logic, NO direct API calls.
    *   **Responsibility**: Receive props, render UI, dispatch events.
    *   **Path**: `src/components/*` or `src/features/*/components/*`
2.  **Application Layer (Hooks/Store)**: Custom Hooks and Stores.
    *   **Rule**: Connects UI to Domain logic. Handles local state and side effects.
    *   **Responsibility**: `useEditorState`, `useAIStream`, `useAuth`.
    *   **Path**: `src/hooks/*` or `src/features/*/hooks/*`
3.  **Domain/Infrastructure Layer (Services)**: Pure TS/JS functions.
    *   **Rule**: Framework agnostic where possible.
    *   **Responsibility**: API clients, Data transformation, WebSocket managers.
    *   **Path**: `src/services/*` or `src/lib/*`

### Directory Structure (Feature-First)

Instead of grouping by type (components, hooks), group by **Feature** to keep related code together and minimize cognitive load.

```
src/
├── features/
│   ├── editor/           # Tiptap implementation & extensions
│   │   ├── components/   # Editor-specific UI
│   │   ├── hooks/        # useTiptap, useSelection
│   │   └── utils/        # Parsers, serializers
│   ├── ai-assistant/     # All AI logic (Caret)
│   │   ├── components/   # ChatPanel, DiffView
│   │   ├── hooks/        # useCompletion
│   │   └── api/          # streamingClient.ts
│   └── collaboration/    # Multiplayer logic (Y.js)
├── components/ui/        # Shared "Dumb" Primitives (Button, Input)
├── hooks/                # Shared hooks (useTheme, useMediaQuery)
├── lib/                  # Shared utilities & 3rd party configs
└── stores/               # Global state definitions (Zustand)
```

---

## 17. Componentization Strategy

### 1. Primitives vs. Features
*   **Primitives (`components/ui`)**: "Dumb" components. They have no business logic. They are styled via Tailwind and controlled via props (e.g., `<Button>`, `<Modal>`).
*   **Features (`features/*`)**: "Smart" components. They are connected to stores or hooks (e.g., `<EditorToolbar>`, `<ChatWindow>`).

### 2. Composition Pattern (Avoid Prop Drilling)
Prefer **Component Composition** over passing props down multiple levels.

*   **Bad (Drilling)**: `<Layout user={user} theme={theme} onLogout={...} />`
*   **Good (Composition)**:
```tsx
<Layout>
  <Header user={user} />
  <Sidebar />
  <Content />
</Layout>
```

### 3. Compound Components
For complex UI elements (like Dropdowns or Tabs), use the **Compound Component** pattern to keep the API clean and flexible.

```tsx
// Usage Example
<Dropdown>
  <Dropdown.Trigger>Options</Dropdown.Trigger>
  <Dropdown.Menu>
    <Dropdown.Item>Edit</Dropdown.Item>
    <Dropdown.Item>Delete</Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>
```

---

## 18. State Management Strategy

A document editor has complex state needs. We must not mix them.

| State Type | Solution | Usage Rule |
|:-----------|:---------|:-----------|
| **Editor State** | Tiptap (Prosemirror) | Encapsulated within the Tiptap engine. Accessed ONLY via `useEditor` hook context. Never duplicate this in React state. |
| **Global UI** | Zustand | For app-wide preferences: Theme, Sidebar visibility, User Session. |
| **Server State** | TanStack Query | For async data: Loading documents, fetching folders. Handles caching and loading states automatically. |
| **Form/Local** | React `useState` | For ephemeral state: Input values, toggle open/close, hover states. |

---

## 19. Editor Typography Overrides

To achieve the "Swiss Focus" aesthetic within the document canvas, we apply specific overrides to the Tiptap editor content (usually via the `.prose` class or similar).

```css
/* Editor Content Styling */
.caret-editor {
  font-family: var(--font-document);
  color: var(--color-text-primary);
  line-height: 1.7;
}

/* Swiss Focus Headings: No bold, strictly typographic hierarchy */
.caret-editor h1 {
  font-size: 32px;
  font-weight: 400;
  letter-spacing: -0.02em;
  margin-bottom: 1.5rem;
}

.caret-editor h2 {
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.02em;
  margin-top: 2rem;
  margin-bottom: 1rem;
}

.caret-editor h3 {
  font-size: 24px;
  font-weight: 400;
  letter-spacing: -0.02em;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

/* Blockquotes: Minimalist but distinct */
.caret-editor blockquote {
  border-left: 4px solid var(--color-accent);
  padding-left: 1.5rem;
  font-style: italic;
  color: var(--color-text-secondary);
  margin: 2rem 0;
}

/* Lists: Clean alignment */
.caret-editor ul, .caret-editor ol {
  padding-left: 1.5rem;
  margin-bottom: 1.5rem;
}

.caret-editor li {
  margin-bottom: 0.5rem;
}

/* AI Suggestions (Ghost Text) */
.caret-editor .suggestion {
  color: var(--color-text-ghost);
  pointer-events: none;
}
```

---

## 20. Summary Checklist for Implementation

- [ ] Setup Tailwind with custom design tokens
- [ ] Implement CSS variables for theme switching
- [ ] Implement Feature-First Folder Structure
- [ ] Setup TanStack Query & Zustand
- [ ] Install Tiptap & Core Extensions
- [ ] Setup Lucide React for Iconography
- [ ] Create base UI component library (Button, Input, etc.)
- [ ] Build Tiptap editor with Swiss Focus typography overrides
- [ ] Implement Caret AI Panel with all states
- [ ] Add real-time collaboration UI (cursors, avatars)
- [ ] Setup responsive layouts for mobile/tablet/desktop
- [ ] Implement dark mode toggle with persistence
- [ ] Add keyboard shortcuts and accessibility features
- [ ] Test color contrast compliance (WCAG AA)
- [ ] Optimize fonts and animations for performance
