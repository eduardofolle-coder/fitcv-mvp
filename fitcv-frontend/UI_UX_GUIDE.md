# FITCV UI/UX Guide

## 🎨 Design Principles

### 1. **Clarity**
- Clean interfaces with minimal distractions
- Clear hierarchy of information
- Self-explanatory controls

### 2. **Speed**
- Instant feedback on interactions
- Loading states for async operations
- Quick navigation paths

### 3. **Trust**
- Security indicators visible
- Clear error messages
- Transparent data handling

### 4. **Delight**
- Smooth animations and transitions
- Helpful micro-interactions
- Encouraging success messages

## 📐 Layout Patterns

### Dashboard Layout
```
┌─────────────────────────────────────┐
│    FITCV  |  Dashboard  |  Logout   │  Header
├─────────────────────────────────────┤
│  📊 Dashboard | 📄 CV | 📝 Apps     │  Navigation
├─────────────────────────────────────┤
│                                     │
│  [Learning Data Tabs]               │  Main Content
│  - Keywords                         │
│  - Patterns                         │
│  - Skills                           │
│  - Recommendations                  │
│  - Trends                           │
│                                     │
└─────────────────────────────────────┘
```

### Card Grid
```
[Card 1]  [Card 2]  [Card 3]
[Card 4]  [Card 5]  [Card 6]
```
- Responsive: 3 columns (desktop) → 1 column (mobile)
- Gap: 16px
- Cards: 400px height (avg)

### Form Layout
```
[Label]
[Input Field]
[Helper Text]

[Label]
[Input Field]
[Error Text] (if error)
```

## 🎯 User Flows

### Authentication Flow
```
Landing Page
     ↓
[Sign Up]  OR  [Login]
     ↓
Dashboard
```

### Job Application Flow
```
[Upload CV]
     ↓
[AI Analysis]
     ↓
[View Profile]
     ↓
[See Recommendations]
     ↓
[Apply to Job]
     ↓
[Track Application]
```

## 🎨 Color Usage

- **Blue (#2563eb)**: Primary actions, navigation
- **Green**: Success states, positive outcomes
- **Red**: Errors, rejections
- **Yellow**: Warnings, pending status
- **Gray**: Secondary text, disabled states

## 📱 Responsive Design

### Mobile (< 640px)
- Single column layouts
- Full-width buttons
- Stacked navigation
- Larger touch targets (44px min)

### Tablet (640px - 1024px)
- 2-column layouts
- Grid view possible
- Horizontal navigation

### Desktop (> 1024px)
- 3-column layouts
- Sidebar navigation
- Multiple panels visible

## ♿ Accessibility

- **Color Contrast**: WCAG AA (4.5:1 minimum)
- **Focus Indicators**: Visible on all interactive elements
- **Keyboard Navigation**: Full keyboard support
- **Labels**: All inputs have associated labels
- **Alt Text**: Images have descriptive alt text

## 🎬 Interaction Patterns

### Hover States
- Button: Change background color
- Card: Slight shadow increase
- Link: Underline + color change

### Focus States
- Ring: 2px solid blue
- Offset: 2px
- Applies to: buttons, inputs, links

### Loading States
- Spinner: Rotating icon
- Disabled: Gray out button
- Text: "Loading..." or "Saving..."

### Error States
- Border: Red outline
- Icon: ⚠️ or ❌
- Message: Clear explanation
- Action: Suggest next steps

### Empty States
- Icon: Relevant emoji (e.g., 📭)
- Title: "No applications yet"
- Description: "Get started by uploading your CV"
- CTA: Button to primary action

## 📊 Data Visualization

### Keywords
- Pills/Badges with colors
- Sorted by frequency/importance
- Hover shows score

### Patterns
- Stats cards with numbers
- Company logos (if available)
- Timeline view optional

### Trends
- Bar charts (mobile-friendly)
- Color-coded by category
- Interactive on hover

## 🎯 Navigation

### Primary Navigation
- Location: Top header
- Items: Dashboard, CV, Applications
- Active state: Bold + blue background

### Mobile Menu
- Hamburger icon
- Slide-out panel
- Full-width options

## 🔔 Notifications

### Toast (Top-right)
- Success: Green
- Error: Red
- Info: Blue
- Auto-dismiss: 4 seconds

### Inline Alerts
- Error: Full form width
- Warning: Yellow background
- Info: Blue background

## 🌙 Dark Mode (Future)

- Color adjustments
- Reduced brightness
- Same contrast ratios
- Toggle in settings

## 📋 Checklist for New Pages

- [ ] Responsive (mobile, tablet, desktop)
- [ ] Accessible (keyboard nav, screen reader)
- [ ] Loading states handled
- [ ] Error states designed
- [ ] Empty states included
- [ ] Hover/focus states visible
- [ ] Consistent with design system
- [ ] Tested on multiple browsers
- [ ] Performance optimized
- [ ] Analytics events added

## 🎨 Design Tools

- **Colors**: Tailwind CSS
- **Fonts**: System fonts (inter, segoe ui)
- **Icons**: Emoji (lightweight)
- **Animations**: CSS transitions

## 📞 Design Support

For questions about implementation:
1. Check this guide
2. Review design-system.md
3. Check existing components
4. Ask in development team chat
