# Joji Health Bridge

Rebuild the JOJI health communication platform as a modern React/Next.js 14+ web application. JOJI is built by MedNova Lifesciences, Lagos, Nigeria. It is a multilingual health communication platform for Nigerian hospitals, NGOs, and health workers. The app must feel clean, professional, and hospital-grade — not like a generic AI-generated template.

### BRAND & DESIGN SYSTEM

- Primary colors: Deep teal (#0B3C49), soft teal (#147D9A), cyan accent (#00B8D9), emerald (#16A34A), warm paper background (#F8FAFC), soft paper (#EEF4F7).

- Typography: Use a serif font (like Fraunces or Playfair Display) for headings and a clean sans-serif (like Inter or IBM Plex Sans) for body text. Monospace for labels/stats.

- The UI must NOT look plain or template-like. Use subtle gradients, soft shadows, rounded corners (12-16px), and generous whitespace. Dark sections should use the deep teal (#0B3C49) with warm cream text.

- Mobile-responsive is mandatory.

### APP ARCHITECTURE (Sidebar Navigation)

The app is a single-page dashboard with a persistent left sidebar. Routes/pages:

1. **Landing Page** (`/`) — Public-facing marketing page explaining what JOJI is: "Africa's multilingual health communication platform." Hero section, language strip (Yorùbá, Igbo, Hausa, Nigerian Pidgin), stats, product overview (Campaigns, Research, Care), trust band, and a CTA to "Get Started" which routes to auth. Footer: "Built by MedNova Lifesciences · Lagos, Nigeria."

2. **Auth Screen** (`/auth`) — Clean split-screen or centered card. Tabs for Login and Sign Up. Fields: email, password, full name, organization type (Hospital, NGO, Pharma/CRO, Government, Other), phone number. Use localStorage or a simple JWT mock for session state. No complex backend required for now.

3. **Dashboard Shell** (`/app/*`) — After login, users see a persistent left sidebar with these sections:

   - **Translate** — The core real-time translation tool.

   - **Campaign Studio** — Turn one document into multilingual campaign materials.

   - **Maternal Health** — Pregnancy calculators, postpartum tracker, vaccination schedule, breastfeeding Q&A.

   - **Settings** — Profile, organization details, language preferences.

### 1. TRANSLATE MODULE (The Star Feature)

This is a real-time, bidirectional translation interface for patient-doctor communication.

**Layout:** Split-screen or two-panel chat interface.

- **Left Panel:** "Patient Side" — Shows the conversation in the PATIENT'S language.

- **Right Panel:** "Doctor Side" — Shows the conversation in the DOCTOR'S language (English by default).

- Both panels update in real-time as either party speaks or types.

**Voice-to-Translation Flow:**

- Patient presses "Hold to Speak" (or taps microphone), speaks in Yorùbá/Igbo/Hausa/Pidgin.

- App uses the Web Speech API (`SpeechRecognition`) to capture speech.

- The transcribed text is sent to a translation backend (OpenAI GPT-4o-mini or similar via a simple API route).

- The translated English text appears instantly on the Doctor's side.

- Doctor can then press "Hold to Speak" in English, and the translated text appears on the Patient's side in their chosen language.

- Include a 🔊 text-to-speech button on each message so the recipient can hear it spoken aloud.

**Text Input Fallback:**

- Both sides have a text input field. Patient types in Yorùbá → doctor sees English. Doctor types in English → patient sees Yorùbá.

**Language Selector:**

- Patient side dropdown: Yorùbá, Igbo, Hausa, Nigerian Pidgin.

- Doctor side is locked to English (or can toggle if needed).

- Show the active language pair clearly (e.g., "Yorùbá ↔ English").

**Session/Room Concept (Optional but Preferred):**

- Allow generating a simple 4-digit "Room Code" so a doctor and patient can join the same translation session from two different devices/phones. Use simple WebSocket simulation or polling if full WebSocket is too complex. If too complex, build it as a single-device split-screen tool first, but architect the state so room-based sync can be added later.

**Safety:** Include best-effort emergency phrase detection (chest pain, can't breathe, suicide keywords) in English, Yorùbá, Igbo, Hausa, and Pidgin. If detected, show a prominent red banner: "This may be an emergency. Please call 112 or seek immediate care."

### 2. CAMPAIGN STUDIO MODULE

- Input: Textarea to paste campaign text + optional topic/audience context + file upload (.docx, .txt).

- Output: AI generates a campaign kit with:

  - Leaflets in Yorùbá, Igbo, Hausa, and Nigerian Pidgin.

  - Radio script (English).

  - WhatsApp messages (English).

  - SMS messages (English, under 160 chars).

  - Facebook post (English).

  - Community Health Worker script (English).

- Display outputs as clean cards with Copy buttons.

- Include a "Download PDF" button that compiles everything into a single PDF.

- Add a disclaimer: "AI-generated draft. Review with a native speaker before publishing."

- Gate the generation behind a simple lead capture form (name, email, phone, org type) stored in localStorage so it only asks once.

### 3. MATERNAL HEALTH MODULE

A collection of tools in a grid layout:

- **Pregnancy Due Date Calculator:** Input LMP date. Output: EDD, current week, trimester (Naegele's rule).

- **Postpartum Stage Calculator:** Input birth date. Output: Weeks since birth, stage (immediate/early/extended/late).

- **Vaccination Schedule:** Input child's DOB. Output: Nigeria NPHCDA routine immunization table (BCG, OPV, Pentavalent, PCV, Measles, etc.) with dates calculated from DOB. Highlight past doses and next upcoming dose.

- **Breastfeeding Q&A:** Quick-launch buttons that pre-fill the Translate module with questions like "How often should I breastfeed my newborn?"

- **Cycle/Ovulation Calculator:** Input last period, cycle length, period length. Output: Next period, fertile window, estimated ovulation.

All calculators must show clear medical disclaimers: "Estimate only. Consult your health worker."

### TECHNICAL REQUIREMENTS

- **Framework:** Next.js 14+ App Router, React 18+, TypeScript.

- **Styling:** Tailwind CSS. Use the color tokens above as CSS variables in `globals.css`.

- **State Management:** React Context or Zustand for auth and app state.

- **Backend:** Simple Next.js API Routes. Use OpenAI API (GPT-4o-mini) for translations and campaign generation. DO NOT use Cloudflare Workers or complex proxy setups. Just a simple `app/api/translate/route.ts` and `app/api/campaign/route.ts` that call OpenAI with a system prompt.

- **Translation API:** The API route should accept `{ text, fromLang, toLang }` and return `{ translation }`. System prompt: "You are JOJI, a medical translation assistant for Nigerian languages. Translate the following health text accurately into [target language] using plain, everyday phrasing. Preserve medical meaning but avoid jargon."

- **File Parsing:** For .docx upload in Campaign Studio, use `mammoth.js` on the frontend to extract text before sending to API.

- **PDF Generation:** Use `jspdf` on the frontend for the campaign kit download.

- **Icons:** Use Lucide React icons only. No emojis in the UI (replace all emojis with Lucide icons).

- **Speech:** Use native Web Speech API (`SpeechRecognition` and `speechSynthesis`). Gracefully degrade if unsupported.

### AUTH FLOW

- `/auth` page with Login/Signup toggle.

- Store a simple JWT string or even a signed object in localStorage/cookies.

- Protect `/app/*` routes with a middleware or layout check that redirects unauthenticated users to `/auth`.

- Mock the auth backend if needed — just verify email/password against a local JSON or simple in-memory store for the demo. Make it clear where to plug in a real auth provider (Supabase Auth, Clerk, etc.) later.

### IMPORTANT UX NOTES

- Every AI-generated output must have a disclaimer.

- The Translate module should feel like a live communication tool, not a static form. Use animated message bubbles, typing indicators, and clear "listening..." states.

- The sidebar should be collapsible on mobile (hamburger menu).

- Use skeleton loaders while AI is generating content.

- The overall feel should be trustworthy, clinical but warm — like a modern hospital app, not a chatbot toy.

### DELIVERABLES

Provide the complete Next.js project structure with:

1. All page components in `app/`

2. Reusable components in `components/ui/` (sidebar, cards, buttons, inputs, modals)

3. API routes in `app/api/`

4. A `README.md` with setup instructions (npm install, add OPENAI_API_KEY to .env, npm run dev)

we will also be using a STT called chirp 3 then the open AI model can translate it

5. A `.env.example` file showing `OPENAI_API_KEY=sk-...`

Do not use Anthropic/Claude API. Use OpenAI only — it's easier to set up. Make the code clean, well-commented, and production-ready in structure even if the auth is mocked.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a0d44057-a5c6-4f0e-9a98-0a43e073efbe).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
