# Boredless Style Guide

## Brand Identity
Boredless is a premium social party game platform. The visual language should feel **modern, confident, and polished** — like a product you'd proudly put on a living room TV.

## Color Palette

### Backgrounds
- **Base:** `bg-gray-950` (#030712)
- **Gradient overlay (all screens):** `bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30`
- **Ambient glow:** `bg-indigo-500/5` with `blur-3xl` — subtle halo for depth

### Text
- **Primary:** `text-white`
- **Secondary:** `text-gray-400`
- **Tertiary/Muted:** `text-gray-500` to `text-gray-600`
- **Brand highlight:** `text-indigo-400`
- **Accent (success):** `text-emerald-400`
- **Accent (warning):** `text-amber-400`
- **Accent (danger):** `text-red-400`

### Surfaces (Cards, Badges, Inputs)
- **Glass card:** `bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl`
- **Glass card hover:** `hover:bg-white/[0.06]`
- **Selected state:** `border-indigo-500/60 bg-indigo-500/10`
- **Input fields:** `bg-white/5 border border-white/10 focus:border-indigo-500/50`

### Game-Specific Accents
- **Bluff Battle:** Indigo (`text-indigo-400`, `bg-indigo-500/15`)
- **Village of Shadows:** Violet (`text-violet-400`, `bg-violet-500/15`)

## Typography
- **Brand name:** `text-5xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent` (TV: 7-8xl, Phone: 4xl)
- **Section headings:** `text-2xl font-bold text-white` (TV: 3-5xl)
- **Body:** `text-lg text-gray-400`
- **Labels:** `text-xs text-gray-500 uppercase tracking-wider`
- **Counters/Timers:** `font-bold tabular-nums` (size varies by context)

## Icons
**NEVER use emoji.** All icons use [Lucide React](https://lucide.dev/).

### Icon Mapping
| Concept | Lucide Icon | Usage |
|---------|------------|-------|
| Host/Crown | `Crown` | Host indicator |
| Players | `Users` | Player count |
| Time/Clock | `Clock` | Duration |
| Check/Done | `Check` | Submission confirmed |
| Loading | `Loader2` | With `animate-spin` |
| Send | `Send` | Submit actions |
| Vote | `Vote` | Voting phase |
| TV/Display | `Monitor` | "Look at the TV" |
| Trophy | `Trophy` | Game over/winner |
| Phone | `Smartphone` | Scan prompt |
| Navigate | `ChevronRight` | CTA buttons |
| Theater | `Theater` | Bluff Battle game |
| Moon | `Moon` | Village / Night |
| Sun | `Sun` | Day phase |
| Eye | `Eye` | Seer / Inspect |
| Shield | `Shield` | Doctor / Protect |
| Skull | `Skull` | Eliminated / Dead |
| Crosshair | `Crosshair` | Werewolf / Target |
| MessageCircle | `MessageCircle` | Discussion |
| Ballot | `Vote` | Voting |
| Star | `Star` | Role reveal |

### Icon Sizing
- **Inline with text:** 14-18px
- **In badges/buttons:** 16-20px
- **Feature icons (centered):** 24-32px
- **Hero icons (in icon containers):** 32px inside `w-16 h-16 rounded-2xl` container

### Icon Containers
For standalone phase/status icons:
```
<div className="w-16 h-16 rounded-2xl bg-{color}-500/15 flex items-center justify-center">
  <IconName size={32} className="text-{color}-400" />
</div>
```

## Buttons
- **Primary CTA:** `bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl py-4`
- **Primary CTA shadow:** `shadow-lg shadow-indigo-600/25`
- **Disabled:** `bg-white/5 text-gray-600 border border-white/10`
- **Destructive:** `hover:bg-red-900/50 hover:border-red-500/40`
- **Selection card:** `bg-white/[0.03] border border-white/8 hover:bg-white/[0.06]`
- **Min touch target:** `min-h-[44px]` (mobile)

## Layout Patterns

### Screen Wrapper (Phone)
```tsx
<div className="flex flex-col min-h-dvh bg-gray-950 relative overflow-hidden">
  {/* Background */}
  <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-indigo-500/8 rounded-full blur-3xl" />
  <div className="relative z-10 ...">
    {/* Content */}
  </div>
</div>
```

### Screen Wrapper (TV/Display)
```tsx
<div className="flex flex-col h-full bg-gray-950 relative overflow-hidden">
  <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/5 rounded-full blur-3xl" />
  <div className="relative z-10 ...">
    {/* Content */}
  </div>
</div>
```

### Centered Status Screens (Phone)
For "waiting", "submitted", "look at TV" states:
```tsx
<div className="flex flex-col items-center gap-4 text-center">
  {/* Icon container */}
  <div className="w-16 h-16 rounded-2xl bg-{color}-500/15 flex items-center justify-center">
    <Icon size={32} className="text-{color}-400" />
  </div>
  <h2 className="text-2xl font-bold text-white">Title</h2>
  <p className="text-gray-500">Subtitle</p>
</div>
```

## Timer Display
- **Phone:** `text-5xl font-bold tabular-nums` — top of screen, muted `text-white/30`, urgent `text-red-400`
- **TV:** `text-6xl font-bold tabular-nums` — same color rules
- **Urgent threshold:** ≤5 seconds

## Player Indicators
- **Colored initial avatar:** `w-10 h-10 rounded-full` with `backgroundColor: player.color`, white bold initial letter centered
- **Player pill:** `flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/5 border border-white/10`
- **Dead player:** `opacity-30` + `Skull` icon
- **Host indicator:** `Crown` icon in `text-amber-400`, size 16

## Role Badges (Village of Shadows)
Roles use Lucide icons, NOT emoji:
- **Villager:** `Users` icon, emerald
- **Werewolf:** `Crosshair` icon, red
- **Seer:** `Eye` icon, violet
- **Doctor:** `Shield` icon, blue

Badge:
```tsx
<div className="flex items-center gap-2 px-4 py-2 rounded-full bg-{color}/15 border border-{color}/30">
  <Icon size={20} className="text-{color}" />
  <span className="font-bold text-{color}">Role Name</span>
</div>
```

## Animations
- **Loading spinner:** Lucide `Loader2` with `animate-spin`
- **Waiting dots:** Three `w-2 h-2 rounded-full animate-bounce` with staggered `animationDelay`
- **Urgent timer:** `text-red-400` (no pulse — keep it clean)
- **Transitions:** `transition-all duration-200`

## Do's and Don'ts
- ✅ Use Lucide icons for everything
- ✅ Use glassmorphism surfaces (bg-white/5, backdrop-blur, border-white/10)
- ✅ Use the gradient background on every screen
- ✅ Use rounded-2xl for cards and buttons
- ✅ Keep text hierarchy consistent (white > gray-400 > gray-500)
- ❌ Never use emoji
- ❌ Never use flat black backgrounds without the gradient
- ❌ Never use bright solid backgrounds
- ❌ Never use standard HTML form controls without styling
- ❌ Never use borders heavier than border-white/10 on glass surfaces
